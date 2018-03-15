import { fileBackedObject } from "./FileBackedObject";
import { PersonalSettings } from "./PersonalSettings";
import { SharedSettings } from "./SharedSettings";

import Discord = require("discord.js");
import fetch from "node-fetch";

export default class KeyFinder {
    private sharedSettings: SharedSettings;
    private keys: FoundKeyInfo[];
    private bot: Discord.Client;
    private channel?: Discord.TextChannel = undefined;

    constructor(bot: Discord.Client, sharedSettings: SharedSettings, keyFile: string) {
        console.log("Requested KeyFinder extension..");

        this.sharedSettings = sharedSettings;
        console.log("Successfully loaded KeyFinder settings file.");

        this.keys = fileBackedObject(keyFile);
        console.log("Successfully loaded KeyFinder key file.");

        this.bot = bot;

        this.bot.on("ready", () => {
            const guild = this.bot.guilds.get(this.sharedSettings.server);

            if (guild) {
                const channel = guild.channels.find("name", this.sharedSettings.keyFinder.reportChannel) as Discord.TextChannel;
                if (channel) {
                    this.channel = channel;
                } else {
                    console.error(`KeyFinder: Incorrect setting for the channel: ${this.sharedSettings.keyFinder.reportChannel}`);
                }
            } else {
                console.error(`KeyFinder: Incorrect setting for the server: ${this.sharedSettings.server}`);
            }

            console.log("KeyFinder extension loaded.");
            this.testAllKeys();
        });
        this.bot.on("message", this.onMessage.bind(this));
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
        const matches = message.match(/(RGAPI-)?[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}/ig);
        if (!matches) { return false; }

        let found = false;
        for (const match of matches) {
            const limit = await this.testKey(match);
            found = found || limit !== null;

            if (limit == null) { continue; }

            const existing = this.keys.find(x => x.apiKey === match);
            if (existing) {
                // we've already seen the key, check for other keys
                continue;
            }

            this.keys.push({
                apiKey: match,
                location,
                rateLimit: limit,
                timestamp,
                user,
            });

            const returnMessage = `Found an ${limit ? "active" : "inactive"} key in ${location} posted by ${user}: \`${match}\`. Key rate limit: \`${limit}\`.`;
            console.warn(returnMessage);
            if (this.channel) { this.channel.send(returnMessage); }
            break;
        }

        return found;
    }

    private onMessage(incomingMessage: Discord.Message) {
        if (incomingMessage.author.id === this.bot.user.id) return;

        this.findKey(`<@${incomingMessage.author.id}>`, incomingMessage.content, `<#${incomingMessage.channel.id}>`, incomingMessage.createdTimestamp);

        // Check if the reporting channel is enabled, the message was sent in the reporting channel, and the command to view active keys was used
        if (!this.channel) return;
        if (incomingMessage.channel.id !== this.channel.id) return;
        if (!(incomingMessage.content.startsWith("!active_keys") || incomingMessage.content.startsWith("!activekeys"))) return;

        if (this.keys.length === 0) {
            incomingMessage.reply("I haven't found any keys.");
            return;
        }

        let outgoingMessage = `I've found ${this.keys.length} key${this.keys.length === 1 ? "" : "s"} that ${this.keys.length === 1 ? "is" : "are"} still active:\n`;
        for (const keyInfo of this.keys) {
            outgoingMessage += `- \`${keyInfo.apiKey}\` (posted by ${keyInfo.user} in ${keyInfo.location} on ${new Date(keyInfo.timestamp)}). Rate limit: \`${keyInfo.rateLimit}\`\n`;
        }

        incomingMessage.reply(outgoingMessage);
    }

    /**
     * Checks if an AnswerHubAPI key is valid
     * @param key The AnswerHubAPI key to test
     * @async
     * @returns The value of the "X-App-Rate-Limit" header ('undefined' if a header is not included in the response) if the key yields a non-403 response code, or 'null' if the key yields a 403 response code
     * @throws {Error} Thrown if the AnswerHubAPI call cannot be completed or results in a status code other than 200 or 403
     */
    private async testKey(key: string): Promise<string | null> {
        const resp = await fetch("https://euw1.api.riotgames.com/lol/summoner/v3/summoners/22929336", {
            headers: {
                "X-Riot-Token": key,
            },
        });

        return resp.status === 403 ? null : resp.headers.get("x-app-rate-limit");
    }

    /**
     * Tests all keys to see if they are still active, removing deactivated keys from the list and logging a message for each one
     */
    private testAllKeys(): void {
        for (let i = 0; i < this.keys.length; i++) {
            const keyInfo = this.keys[i];
            this.testKey(keyInfo.apiKey).then(header => {
                if (header !== null) {
                    return;
                }

                this.keys.splice(i, 1);

                const message = `Key \`${keyInfo.apiKey}\` returns 403 Forbidden now, removing it from my database.`;
                console.warn(message);
                if (this.channel) { this.channel.send(message); }
            });
        }

        setTimeout(this.testAllKeys.bind(this), 10000);
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
