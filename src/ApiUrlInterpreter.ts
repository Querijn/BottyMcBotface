import Discord = require("discord.js");
import fs = require("fs");
import fetch from "node-fetch";
import prettyMs = require("pretty-ms");

import { APISchema, Path } from "./ApiSchema";
import { fileBackedObject } from "./FileBackedObject";
import levenshteinDistance from "./LevenshteinDistance";
import { PersonalSettings, SharedSettings } from "./SharedSettings";

import { ENODATA } from "constants";
import { Response } from "node-fetch";

class RatelimitResult {
    public rateLimit: number;
    public startTime: number | null;

    constructor(rateLimit: number, startTime: number | null) {
        this.rateLimit = rateLimit;
        this.startTime = startTime;
    }
}

export default class ApiUrlInterpreter {
    private static ratelimitErrorMs = 100;

    private bot: Discord.Client;
    private sharedSettings: SharedSettings;
    private personalSettings: PersonalSettings;
    private apiSchema: APISchema;
    private iterator: number = 1;

    private applicationRatelimitLastTime: number = 0;
    private methodRatelimitLastTime: { [method: string]: number } = {};
    private applicationStartTime: number = 0;
    private methodStartTime: { [method: string]: number } = {};

    private fetchSettings: Object;

    constructor(bot: Discord.Client, sharedSettings: SharedSettings, apiSchema: APISchema) {
        console.log("Requested API URL Interpreter extension..");

        this.sharedSettings = sharedSettings;
        this.personalSettings = sharedSettings.botty;
        this.apiSchema = apiSchema;
        console.log("Successfully loaded API URL Interpreter settings.");

        this.fetchSettings = {
            headers: {
                "X-Riot-Token": this.personalSettings.riotApi.key
            }
        };

        this.bot = bot;
        this.bot.on("ready", this.onBot.bind(this));
        this.bot.on("message", this.onMessage.bind(this));
    }

    onBot() {
        console.log("API URL Interpreter extension loaded.");
    }

    onMessage(message: Discord.Message) {
        if (message.author.bot) return;

        this.onRiotApiURL(message);
    }

    async onRiotApiURL(message: Discord.Message, content: string | null = null) {

        // Init message if missing, also append with space.
        if (!content) content = message.content.replace(/(`){1,3}(.*?)(`){1,3}/g, "") + " ";

        if (content.indexOf("https://") == -1) return; // We're about to do ~80 regex tests, better make sure that it's on a message with a URL

        for (const path of this.apiSchema.paths) {

            // Check if path was valid
            const validMatch = new RegExp(path.regex.valid, "g").exec(content);
            if (validMatch && validMatch.length > 0) {

                let replyMessageContent = `Making a request to ${path.method}..`;

                const replyMessages = await message.channel.send(replyMessageContent);
                const replyMessage = Array.isArray(replyMessages) ? replyMessages[0] : replyMessages;

                const region = validMatch[1];

                // Path works fine, make a request
                await this.makeRequest(path, region, validMatch[0], replyMessage);
                return;
            }
        }

        for (const path of this.apiSchema.paths) {
            // Now check if it's the same path, but with incorrect parameters.
            const invalidMatch = new RegExp(path.regex.invalid, "g").exec(content);
            if (invalidMatch && invalidMatch.length > 0) {
                let errorIdentified = false;

                let mistakes = [];

                // Get closest platform if incorrect
                const closestPlatform = this.getClosestPlatform(invalidMatch[1]);
                if (closestPlatform) {
                    errorIdentified = true;
                    mistakes.push(`- The platform \`${invalidMatch[1]}\` is invalid, did you mean: \`${closestPlatform}\`? Expected one of the following values: \`${this.apiSchema.platforms.join(", ")}\``);
                }

                invalidMatch.splice(0, 2); // Remove url and platform from array

                // This now contains all required parameters.
                for (let j = 0; j < Math.max(path.parameterInfo.length, invalidMatch.length); j++) {

                    const parameter = path.parameterInfo[j]; // All info about this parameter
                    const value = invalidMatch[j];

                    // If it's correct, don't bother
                    const parameterCorrect = new RegExp(parameter.valid, "g").exec(value);
                    if (parameterCorrect) continue;

                    // Find the location of the parameter in the URL
                    const start = path.name.indexOf(`/{${parameter.name}}`); // Find /${leagueId}
                    const end = path.name.lastIndexOf("/", start - 1); // Find the / before it
                    let location = path.name.substr(end + 1, start - end); // Make a `leagues/` string.

                    // Get type
                    let type = parameter.schema.type; // Usually this is enough
                    if (parameter.schema.enum) { // If there are limited options what it could be, show them
                        type = parameter.schema.enum.join("/");
                    }

                    mistakes.push(`- Parameter ${j + 1}, expected \`${parameter.name} (${type})\` right after \`${location}\`, got "${value}".`);
                    errorIdentified = true;
                }

                if (!errorIdentified) {
                    message.channel.send(`I see you've posted a Riot Games API url (\`${path.method}\` if I am not mistaken), but I identified it as invalid.. Unfortunately I can't exactly tell why. This might be a bug!`);
                    console.warn("Could not identify the issue with the Riot API url from the following message `" + message.content + "`");
                    return;
                }

                const replyMessageContent = `I see you've posted a Riot Games API url (\`${path.method}\` if I am not mistaken), but it seems to have ${mistakes.length} mistake${mistakes.length !== 1 ? "s" : ""}:\n` + mistakes.join("\n");
                message.channel.send(replyMessageContent);
                return;
            }
        }
    }

    getClosestPlatform(platform: string) {
        const validPlatform = new RegExp(this.apiSchema.platformRegexString, "g").exec(platform);
        if (validPlatform) return null;

        return this.apiSchema.platforms.map(p => {
            return {
                platform: p,
                distance: levenshteinDistance(platform, p)
            }
        })
            .sort((a, b) => a.distance - b.distance)[0].platform;
    }

    async makeRequest(path: Path, region: string, url: string, message: Discord.Message) {

        const currentTime = Date.now();
        if (currentTime < this.applicationRatelimitLastTime) {
            const timeDiff = prettyMs(this.applicationRatelimitLastTime - currentTime, { verbose: true });
            message.edit(`We are ratelimited on our application, please wait ${timeDiff}.`);
            return;
        }

        const servicedMethodName = `${region}.${path.method}`;
        if (this.methodRatelimitLastTime[servicedMethodName] && currentTime < this.methodRatelimitLastTime[servicedMethodName]) {
            const timeDiff = prettyMs(this.methodRatelimitLastTime[servicedMethodName] - currentTime, { verbose: true });
            message.edit(`We are ratelimited by the method (${servicedMethodName}), please wait ${timeDiff}.`);
            return;
        }

        try {
            const resp = await fetch(url, this.fetchSettings);
            this.handleResponse(resp, message, url, servicedMethodName);
        }
        catch (e) {
            console.error(`Error handling the API call: ${e.message}`);
        }
    }

    async handleResponse(resp: Response, message: Discord.Message, url: string, servicedMethodName: string) {
        if (resp === null) {
            console.warn(`Not handling ratelimits due to missing response.`);
            return;
        }

        // Set start times
        if (this.applicationStartTime === 0) {
            this.applicationStartTime = Date.now();
        }
        if (!this.methodStartTime[servicedMethodName]) {
            this.methodStartTime[servicedMethodName] = Date.now();
        }

        // Update application ratelimit
        {
            const countHeader = resp.headers.get("x-app-rate-limit-count");
            const limitHeader = resp.headers.get("x-app-rate-limit");

            if (countHeader && limitHeader) {

                const appCountStrings = countHeader.split(",");
                const appLimitStrings = limitHeader.split(",");
                const appResult = this.handleRatelimit("application", servicedMethodName, this.applicationStartTime, appCountStrings, appLimitStrings);

                if (appResult) {
                    this.applicationRatelimitLastTime = appResult.rateLimit;
                    if (appResult.startTime !== null) this.applicationStartTime = appResult.startTime;
                }
            }
        }

        // Update method ratelimit
        {
            const countHeader = resp.headers.get("x-method-rate-limit-count");
            const limitHeader = resp.headers.get("x-method-rate-limit");

            if (countHeader && limitHeader) {

                const methodCountStrings = countHeader.split(",");
                const methodLimitStrings = limitHeader.split(",");
                const methodResult = this.handleRatelimit("method", servicedMethodName, this.methodStartTime[servicedMethodName], methodCountStrings, methodLimitStrings);

                if (methodResult) {
                    this.methodRatelimitLastTime[servicedMethodName] = methodResult.rateLimit;
                    if (methodResult.startTime !== null) this.methodStartTime[servicedMethodName] = methodResult.startTime;
                }
            }
        }

        if (resp.status != 200) {
            message.edit(`The Riot API responded to ${url} with ${resp.status} ${resp.statusText}.`);
            return;
        }

        try {
            const curIterator = this.iterator;
            const fileName = `${curIterator}.json`;
            const localFile = `${this.personalSettings.webServer.relativeFolderLocation}${fileName}`;

            const json = {
                url: url,
                method: servicedMethodName,
                result: await resp.json(),
            };

            fs.writeFile(localFile, JSON.stringify(json), null, (err: NodeJS.ErrnoException) => {
                if (err != null) {
                    message.edit(`Woah, something went wrong trying to fetch ${url}, sorry!`);
                    console.warn(`Error ${err.code} (${err.name}) while trying to save \`${url}\` to \`${localFile}\`: ${err.message}`);
                    return;
                }

                message.edit(`Response for ${url}:\n${this.personalSettings.webServer.relativeLiveLocation}${fileName}`);
            });

            this.iterator = (this.iterator % 50) + 1;
        }
        catch (e) {
            message.edit("Eh, something went wrong trying to upload this :(").catch((reason) => {
                console.error(`Error occurred trying to edit the message when the upload failed, reason: ${reason}\nreason for failed upload: ${e}`);
            });
            console.error(`Error trying to save the result of an API call: ${e.message}`);
        }
    }

    handleRatelimit(ratelimitType: string, methodName: string, startTime: number, countStrings: string[], limitStrings: string[]): RatelimitResult | null {

        let found = false;
        let longestSpreadTime = 0;
        let resultStartTime: number | null = 0;
        let resultRatelimit = 0;

        for (let i = 0; i < countStrings.length; i++) {
            const splitCount = countStrings[i].split(":");
            const count = parseInt(splitCount[0].trim());
            const time = parseInt(splitCount[1].trim());

            const limit = limitStrings.find(function (element) {
                return element.indexOf(`:${time}`) != -1;
            });
            if (!limit) {
                console.warn(`Unable to find limits for the ${ratelimitType} ratelimit with time being ${time} on a result of ${methodName}.`);
                continue;
            }

            const splitLimit = limit.split(":");
            const max = parseInt(splitLimit[0].trim());

            if (count + 1 >= max) {
                console.warn(`Hit ${ratelimitType} ratelimit with ${methodName}.`);
                return new RatelimitResult(startTime + time * 1000 + ApiUrlInterpreter.ratelimitErrorMs, startTime + time * 1000 + ApiUrlInterpreter.ratelimitErrorMs);
            }

            const spreadTime = 1 / (max / time); // Find the slowest ratelimit.
            if (spreadTime > longestSpreadTime) {

                found = true;
                longestSpreadTime = spreadTime;

                let delay = spreadTime * 1000 + ApiUrlInterpreter.ratelimitErrorMs;
                resultRatelimit = Date.now() + delay;
                if (count <= 1) resultStartTime = Date.now();
                else resultStartTime = null;
            }
        }

        if (found === false) return null;
        return new RatelimitResult(resultRatelimit, resultStartTime)
    }
}
