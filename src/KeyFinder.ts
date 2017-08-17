import Discord = require("discord.js");
import { fileBackedObject } from "./util";
import request = require("request");

export interface KeyFinderSettings {
    Server: string;
    ReportChannel: string;
}

export default class KeyFinder {
    private settings: KeyFinderSettings;
    private keys: FoundKeyInfo[];
    private bot: Discord.Client;
    private channel?: Discord.TextChannel = undefined;

    constructor(bot: Discord.Client, settingsFile: string, keyFile: string) {
        console.log("Requested KeyFinder extension..");

        this.settings = fileBackedObject(settingsFile);
        console.log("Successfully loaded KeyFinder settings file.");

        this.keys = fileBackedObject(keyFile);
        console.log("Successfully loaded KeyFinder key file.");

        this.bot = bot;

        this.bot.on("ready", () => {
            const guild = this.bot.guilds.find("name", this.settings.Server);
            if (guild) {
                const channel = guild.channels.find("name", this.settings.ReportChannel) as Discord.TextChannel;
                if (channel) {
                    this.channel = channel;
                } else {
                    console.error("Incorrect setting for the channel: " + this.settings.ReportChannel);
                }
            } else {
                console.error("Incorrect setting for the server: " + this.settings.Server);
            }

            console.log("KeyFinder extension loaded.");
            this.testAllKeys();
        });
        this.bot.on("message", this.onMessage.bind(this));
    }

    onMessage(incomingMessage: Discord.Message) {
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
        for (const keyInfo of this.keys) outgoingMessage += `- \`${keyInfo.apiKey}\` (posted by ${keyInfo.user} in ${keyInfo.location} on ${new Date(keyInfo.timestamp)}). Rate limit: \`${keyInfo.rateLimit}\`\n`;

        incomingMessage.reply(outgoingMessage);
    }
    /**
	 * Checks if an API key is valid
	 * @param key The API key to test
	 * @async
	 * @returns The value of the "X-App-Rate-Limit" header if the key yields a non-403 response code, or 'null' if the key yields a 403 response code
	 * @throws {Error} Thrown if the API call cannot be completed or results in a status code other than 200 or 403
	 */
    testKey(key: string): Promise<string | null> {
        return new Promise((resolve, reject) => {
            const options = {
                followAllRedirects: true,
                url: "https://euw1.api.riotgames.com/lol/summoner/v3/summoners/22929336",
                headers: {
                    "X-Riot-Token": key
                }
            };

            request(options, (error, response) => {
                if (error) {
                    reject("Error while testing key: " + error);
                } else {
                    if (response.statusCode === 403) {
                        resolve(null);
                    } else {
                        resolve(<string>response.headers["x-app-rate-limit"]);
                    }
                }
            });
        });
    }

    /**
     * Tests all keys to see if they are still active, removing deactivated keys from the list and logging a message for each one
     */
    testAllKeys(): void {
        for (let i = 0; i < this.keys.length; i++) {
            const keyInfo = this.keys[i];
            this.testKey(keyInfo.apiKey).then(keyWorks => {
                if (keyWorks) return;

                this.keys.splice(i, 1);

                const message = `Key \`${keyInfo.apiKey}\` returns 403 Forbidden now, removing it from my database.`;
                console.warn(message);
                if (this.channel) this.channel.send(message);
            });
        }

        setTimeout(this.testAllKeys.bind(this), 10000);
    }

    /**
	 * Checks if a message contains a working API key. If a working key is found (that had not already been found), moderators will be alerted and the key will be tracked
	 * @param user The user who sent the message (used when reporting found keys). If the key was posted on AnswerHub, this should be their username; if the key was posted in Discord, this should be a string to tag them (e.g. "<@178320409303842817>")
	 * @param message The message to check for an API key. Where the key was posted. If the key was posted on AnswerHub, this should be a link to the post; if the key was posted in Discord, this should be a string to tag the channel (e.g. "<#187652476080488449>")
	 * @param location Where the message was sent (used when reporting found keys)
     * @param timestamp When the key was posted (in milliseconds since the Unix epoch)
	 * @async
	 * @returns 'true' if a working API key was found in the message, 'false' if one wasn't
	 */
    async findKey(user: string, message: string, location: string, timestamp: number): Promise<boolean> {
        const matches = message.match(/RGAPI\-[a-fA-F0-9]{8}\-[a-fA-F0-9]{4}\-[a-fA-F0-9]{4}\-[a-fA-F0-9]{4}\-[a-fA-F0-9]{12}/i);

        if (matches === null) return false;
        /** If any of the keys in the message were active */
        let foundWorkingKey = false;

        matchesLoop: for (let key of matches) {
            const rateLimit = await this.testKey(key);
            // 'rateLimits' will be 'null' if the key is invalid
            const keyWorks = !!rateLimit;
            const message = `Found an ${keyWorks ? "active" : "inactive"} key in ${location} posted by ${user}: \`${key}\` Key rate limit: \`${rateLimit}\``;

            if (keyWorks) {
                // Check if key is already being tracked
                for (let foundKeyInfo of this.keys) {
                    if (key === foundKeyInfo.apiKey) {
                        // An active key was found, but it doesn't need to be logged
                        foundWorkingKey = true;
                        break matchesLoop;
                    }
                }

                this.keys.push({
                    apiKey: key,
                    user: user,
                    location: location,
                    timestamp: timestamp,
                    rateLimit: <string>rateLimit
                });
                foundWorkingKey = true;
            }

            console.warn(message);
            if (this.channel) this.channel.send(message);
        }
        return foundWorkingKey;
    }
}

interface FoundKeyInfo {
    apiKey: string;
    /** The person who posted the key. If the key was posted on AnswerHub, this will be their username; if the key was posted in Discord, this will be a string to tag them (e.g. "<@178320409303842817>") */
    user: string;
    /** Where the key was posted. If the key was posted on AnswerHub, this will be a link to the post; if the key was posted in Discord, this will be a string to tag the channel (e.g. "<#187652476080488449>") */
    location: string;
    /** When the key was posted (in milliseconds since the Unix epoch)*/
    timestamp: number;
    /** The key rate limit (in the same form as the "X-App-Rate-Limit" header) */
    rateLimit: string;
}
