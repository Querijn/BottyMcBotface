import { fileBackedObject } from "./FileBackedObject";
import { SharedSettings } from "./SharedSettings";

import { clearTimeout, setTimeout } from "timers";

import Discord = require("discord.js");
import fetch from "node-fetch";

export default class KeyFinder {
    private sharedSettings: SharedSettings;
    private keys: FoundKeyInfo[];
    private bot: Discord.Client;
    private channel?: Discord.TextChannel = undefined;

    private timeOut: NodeJS.Timer | null = null;

    constructor(bot: Discord.Client, sharedSettings: SharedSettings, keyFile: string) {
        console.log("Requested KeyFinder extension..");

        this.sharedSettings = sharedSettings;
        console.log("Successfully loaded KeyFinder settings file.");

        this.keys = fileBackedObject(keyFile);
        console.log("Successfully loaded KeyFinder key file.");

        this.bot = bot;

        this.bot.on("ready", async () => {

            const guild = this.bot.guilds.get(this.sharedSettings.server.guildId);
            if (guild == null) {
                console.error(`KeyFinder: Unable to find server with ID: ${this.sharedSettings.server}`);
                return;
            }

            const channel = guild.channels.find("name", this.sharedSettings.keyFinder.reportChannel) as Discord.TextChannel;
            if (channel == null) {
                if (this.sharedSettings.botty.isProduction) {
                    console.error(`KeyFinder: Unable to find channel: ${this.sharedSettings.keyFinder.reportChannel}`);
                    return;
                }
                this.channel = await guild!.createChannel(this.sharedSettings.keyFinder.reportChannel, "text") as Discord.TextChannel;
            }
            else {
                this.channel = channel;
            }

            console.log("KeyFinder extension loaded.");
            this.testAllKeys();
        });
        this.bot.on("message", this.onMessage.bind(this));
    }

    public onMessage(incomingMessage: Discord.Message) {
        if (incomingMessage.author.id === this.bot.user.id || !incomingMessage.guild) return;

        this.findKey(`<@${incomingMessage.author.id}>`, incomingMessage.content, `<#${incomingMessage.channel.id}>`, incomingMessage.createdTimestamp);
    }

    public onKeyList(message: Discord.Message, isAdmin: boolean, command: string, args: string[]) {
        // only allow this command if it was sent in the reporting channel (#moderators)
        if (!this.channel) return;
        if (message.channel.id !== this.channel.id) return;

        if (this.keys.length === 0) {
            message.reply("I haven't found any keys.");
            return;
        }

        let outgoingMessage = `I've found ${this.keys.length} key${this.keys.length === 1 ? "" : "s"} that ${this.keys.length === 1 ? "is" : "are"} still active:\n`;
        for (const keyInfo of this.keys) outgoingMessage += `- \`${keyInfo.apiKey}\` (posted by ${keyInfo.user} in ${keyInfo.location} on ${new Date(keyInfo.timestamp)}). Rate limit: \`${keyInfo.rateLimit}\`\n`;

        message.reply(outgoingMessage);
    }

    /**
     * Checks if an AnswerHubAPI key is valid
     * @param key The AnswerHubAPI key to test
     * @async
     * @returns The value of the "X-App-Rate-Limit" header ('undefined' if a header is not included in the response) if the key yields a non-403 response code, or 'null' if the key yields a 403 response code
     * @throws {Error} Thrown if the AnswerHubAPI call cannot be completed or results in a status code other than 200 or 403
     */
    public async testKey(key: string): Promise<string | null> {
        const resp = await fetch("https://kr.api.riotgames.com/lol/league/v4/masterleagues/by-queue/RANKED_SOLO_5x5", {
            headers: {
                "X-Riot-Token": key,
            },
        });

        const rateLimit = resp.headers.get("x-app-rate-limit");
        if (resp.status !== 403 && rateLimit === null) {

            const availableHeaders: string[] = [];
            resp.headers.forEach((value: string, header: string) => availableHeaders.push(`${header}: ${value}`));

            console.log(`Key Rate-limit headers for \`${key}\` are missing from a call with status code ${resp.status}. Available headers: \`\`\`${availableHeaders.join("\n")}\`\`\``);
            return "Fake Headers";
        }

        const existingKey = this.keys.find(k => k.apiKey === key);
        if (existingKey && rateLimit) {
            existingKey.rateLimit = rateLimit;
        }

        return resp.status === 403 ? null : rateLimit;
    }

    /**
     * Tests all keys to see if they are still active, removing deactivated keys from the list and logging a message for each one
     */
    public async testAllKeys() {
        for (let i = 0; i < this.keys.length; i++) {
            const keyInfo = this.keys[i];
            const header = await this.testKey(keyInfo.apiKey);

            if (header !== null) continue;

            this.keys.splice(i, 1);

            const message = `Key \`${keyInfo.apiKey}\` returns 403 Forbidden now, removing it from my database.`;
            console.warn(message);
            if (this.channel) this.channel.send(message);
        }

        if (this.timeOut !== null) clearTimeout(this.timeOut);
        this.timeOut = setTimeout(this.testAllKeys.bind(this), 60000);
    }

    /**
     * Checks if a message contains a working AnswerHubAPI key. If a working key is found (that had not already been found), moderators will be alerted and the key will be tracked
     * @param user The user who sent the message (used when reporting found keys). If the key was posted on AnswerHub, this should be their username; if the key was posted in Discord, this should be a string to tag them (e.g. "<@178320409303842817>")
     * @param message The message to check for an AnswerHubAPI key. Where the key was posted. If the key was posted on AnswerHub, this should be a link to the post; if the key was posted in Discord, this should be a string to tag the channel (e.g. "<#187652476080488449>")
     * @param location Where the message was sent (used when reporting found keys)
     * @param timestamp When the key was posted (in milliseconds since the Unix epoch)
     * @async
     * @returns 'true' if a working AnswerHubAPI key was found in the message, 'false' if one wasn't
     */
    public async findKey(user: string, message: string, location: string, timestamp: number): Promise<boolean> {
        const matches = message.match(/(RGAPI-)?[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}/ig);
        if (!matches) return false;

        let found = false;
        for (const match of matches) {

            const limit = await this.testKey(match);
            const existing = this.keys.find(x => x.apiKey === match);
            if (existing) {
                // we've already seen the key, check for other keys
                console.log(`Found duplicate of a known key at ${location} posted by ${user}: \`${match}\`. Key rate limit: \`${limit}\`.`);
                continue;
            }

            found = found || limit !== null;
            if (limit == null) {
                // key is invalid, check for other keys
                console.log(`Found inactive key in ${location} posted by ${user}: \`${match}\`. Key rate limit: \`${limit}\`.`);
                continue;
            }

            this.keys.push({
                apiKey: match,
                rateLimit: limit,
                user,
                location,
                timestamp,
            });

            const response = `Found a key in ${location} posted by ${user}: \`${match}\`. Key rate limit: \`${limit}\`.`;
            console.warn(response);
            if (this.channel) this.channel.send(response);
            break;
        }

        return found;
    }
}

interface FoundKeyInfo {
    apiKey: string;
    /** The person who posted the key. If the key was posted on AnswerHub, this will be their username; if the key was posted in Discord, this will be a string to tag them (e.g. "<@178320409303842817>") */
    user: string;
    /** Where the key was posted. If the key was posted on AnswerHub, this will be a link to the post; if the key was posted in Discord, this will be a string to tag the channel (e.g. "<#187652476080488449>") */
    location: string;
    /** When the key was posted (in milliseconds since the Unix epoch) */
    timestamp: number;
    /** The key rate limit (in the same form as the "X-App-Rate-Limit" header) */
    rateLimit: string;
}
