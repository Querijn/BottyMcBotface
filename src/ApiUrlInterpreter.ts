import Discord = require("discord.js");
import fs = require("fs");
import fetch from "node-fetch";
import prettyMs = require("pretty-ms");
import XRegExp = require("xregexp");

import { ENODATA } from "constants";
import { Response } from "node-fetch";
import { platform } from "os";
import { clearTimeout, setTimeout } from "timers";

import { APISchema, Path } from "./ApiSchema";
import { fileBackedObject } from "./FileBackedObject";
import { levenshteinDistance } from "./LevenshteinDistance";
import { PersonalSettings, SharedSettings } from "./SharedSettings";

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
    /**
     * Matches Riot API call for each match found:
     * The 1st group is named "https" and indicates if the URL is using HTTP or HTTPS (it will be "s" or "S" if HTTPS, and empty if HTTP).
     * The 2nd group is named "platform" and is the platform ID (e.g "na1").
     * The 3rd group is named "path" and is the URL path (e.g. "/lol/summoner/v4/summoners/902572087429847093845790243").
     * The 4th group is named "query" and is the URL query (e.g. "api_key=aaaaaa&ayy=lmao"). If there is no URL query, this group will not exist.
     * https://regex101.com/r/WGLmBG/10/
     */
    private static API_CALL_REGEX = XRegExp("(?:http(?<https>s?):\\/\\/(?<platform>\\w+)\\.api\\.riotgames\\.com)(?<path>\\/[^\\s?]*)(?:\\?(?<query>\\S*))?", "gim");

    private bot: Discord.Client;
    private sharedSettings: SharedSettings;
    private personalSettings: PersonalSettings;
    private apiSchema: APISchema;
    private iterator: number = 1;

    private applicationRatelimitLastTime: number = 0;
    private methodRatelimitLastTime: { [method: string]: number } = {};
    private applicationStartTime: number = 0;
    private methodStartTime: { [method: string]: number } = {};

    private fetchSettings: object;

    constructor(bot: Discord.Client, sharedSettings: SharedSettings, apiSchema: APISchema) {
        console.log("Requested API URL Interpreter extension..");

        this.sharedSettings = sharedSettings;
        this.personalSettings = sharedSettings.botty;
        this.apiSchema = apiSchema;
        console.log("Successfully loaded API URL Interpreter settings.");

        this.fetchSettings = {
            headers: {
                "X-Riot-Token": this.personalSettings.riotApi.key,
            },
        };

        this.bot = bot;
        this.bot.on("ready", this.onBot.bind(this));
        this.bot.on("messageCreate", this.onMessage.bind(this));
    }

    public onBot() {
        console.log("API URL Interpreter extension loaded.");
    }

    private onMessage(message: Discord.Message) {
        if (message.author.bot) return;

        // const urls = message.content.match(ApiUrlInterpreter.API_CALL_REGEX);
        const urls = XRegExp.match(message.content, ApiUrlInterpreter.API_CALL_REGEX);
        if (!urls) return;
        for (const url of urls) {
            this.testRiotApiUrl(url, message);
        }
    }

    private async testRiotApiUrl(url: string, message: Discord.Message) {
        // The type must be `any` because the regex contains named groups
        const urlMatch: any = XRegExp.exec(url, ApiUrlInterpreter.API_CALL_REGEX);

        /** Indicates if there is a problem with this URL that guarantees the call will fail. */
        let fatalError = false;
        const mistakes = [];

        // Check if the URL is using HTTPS
        // `urlMatch.https` will be empty (falsy) if HTTP is being used
        if (!urlMatch.https) {
            mistakes.push(`- This URL is using HTTP. All API calls must be made over HTTPS.`);
            fatalError = true;
        }

        // Check if the platform is valid
        const platformId: string = urlMatch.platform;
        if (!this.apiSchema.platforms.includes(platformId.toLowerCase())) {
            // Get closest platform if incorrect
            const closestPlatform = this.apiSchema.getClosestPlatform(platformId);
            mistakes.push(`- The platform \`${platformId}\` is invalid, did you mean: \`${closestPlatform}\`? Expected one of the following values: \`${this.apiSchema.platforms.join(", ")}\``);
            fatalError = true;
        }

        // Check if the path is valid and validate parameters
        let path: Path | null = null;
        for (const testPath of this.apiSchema.paths) {
            // The type must be `any` because the regex contains named groups
            const pathMatch: any = XRegExp.exec(urlMatch.path, testPath.regex);
            if (!pathMatch || pathMatch.length === 0) {
                continue;
            }
            path = testPath;

            // Check if path parameters are valid
            for (const param of testPath.pathParameters.values()) {
                const paramValue: string = pathMatch[param.name];
                if (paramValue) {
                    if (!param.type.isValidValue(paramValue)) {
                        mistakes.push(`- The value \`${paramValue}\` is not applicable for \`${param.name}\`: the value must be ${param.type.description}.`);
                        fatalError = true;
                    }
                }
                // There's no need to check if path params are missing since the regex wouldn't have matched if they were.
            }

            const queryParams: Map<string, string | string[]> = new Map();
            if (urlMatch.query) {
                for (const pair of urlMatch.query.split("&")) {
                    const [key, value] = pair.split("=");
                    // If a key is specified multiple times, it means the value is a set
                    if (queryParams.has(key)) {
                        // Turn the parameter into a set if it isn't already one
                        if (!Array.isArray(queryParams.get(key))) {
                            queryParams.set(key, [queryParams.get(key) as string]);
                        }
                        (queryParams.get(key) as string[]).push(value);
                    } else {
                        queryParams.set(key, value);
                    }
                }
            }

            // Check if specified query parameters are of the correct type, and all required parameters are specified
            for (const param of path.queryParameters.values()) {
                const paramValue = queryParams.get(param.name);
                if (paramValue) {
                    if (!param.type.isValidValue(paramValue)) {
                        mistakes.push(`- The value \`${paramValue}\` is not applicable for \`${param.name}\`: the value must be ${param.type.description}.`);
                    }
                } else if (param.required) {
                    mistakes.push(`- The query parameter \`${param.name}\` is required but was not specified.`);
                }
            }

            const validParams = Array.from(path.queryParameters.keys());
            // Check if any specified query parameters don't do exist for this method
            for (const key of queryParams.keys()) {
                // The `api_key` parameter is always valid
                if (key === "api_key") continue;
                if (!validParams.includes(key)) {
                    mistakes.push(`- The specified query parameter \`${key}\` does not exist for this method. Although this shouldn't stop the request from working, it means that the request likely won't do what you want it to do.`);
                    // This is not a fatal error
                }
            }

            break;
        }
        if (!path) {
            mistakes.push(`- This URL does not appear to be using a valid endpoint`);
            fatalError = true;
        }

        if (mistakes.length !== 0) {
            const replyMessageContent = `The API call ${url} seems to have ${mistakes.length} mistake${mistakes.length !== 1 ? "s" : ""}:\n` + mistakes.join("\n");
            message.channel.send(replyMessageContent);
        }
        if (fatalError) return;

        if (!path!.canUse) {
            message.channel.send(`I cannot make an API call to ${url} for you (likely because I don't have access to this endpoint)`);
            return;
        }

        const replyMessages = await message.channel.send(`Making a request to ${path!.name}`);
        const replyMessage = Array.isArray(replyMessages) ? replyMessages[0] : replyMessages;

        await this.makeRequest(path!, platformId, url, replyMessage);
    }

    private async makeRequest(path: Path, region: string, url: string, message: Discord.Message) {

        const currentTime = Date.now();
        if (currentTime < this.applicationRatelimitLastTime) {
            const timeDiff = prettyMs(this.applicationRatelimitLastTime - currentTime, { verbose: true });
            message.edit(`We are ratelimited on our application, please wait ${timeDiff}.`);
            return;
        }

        const servicedMethodName = `${region}:${path.name}`;
        if (this.methodRatelimitLastTime[servicedMethodName] && currentTime < this.methodRatelimitLastTime[servicedMethodName]) {
            const timeDiff = prettyMs(this.methodRatelimitLastTime[servicedMethodName] - currentTime, { verbose: true });
            message.edit(`We are ratelimited by the method (${servicedMethodName}), please wait ${timeDiff}.`);
            return;
        }

        try {
            const resp = await fetch(url, this.fetchSettings);
            this.handleResponse(resp, message, url, servicedMethodName);
        } catch (e) {
            console.error(`Error handling the API call: ${e.message}`);
        }
    }

    private async handleResponse(resp: Response, message: Discord.Message, url: string, servicedMethodName: string) {
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

        if (resp.status !== 200) {
            message.edit(`The Riot API responded to ${url} with ${resp.status} ${resp.statusText}.`);
            return;
        }

        try {
            const curIterator = this.iterator;
            const fileName = `${curIterator}.json`;
        
            const json = {
                url,
                method: servicedMethodName,
                result: await resp.json(),
            };
        
            const buffer = Buffer.from(JSON.stringify(json, null, 2), 'utf-8');
            const attachment = new Discord.AttachmentBuilder(buffer, { name: 'image.png' });
            await message.channel.send({ content: `Response for ${url}:`, files: [attachment] });
        
            this.iterator = (this.iterator % 50) + 1;
        } catch (e) {
            message.edit("Eh, something went wrong trying to upload this :(").catch((reason) => {
                console.error(`Error occurred trying to edit the message when the upload failed, reason: ${reason}\nreason for failed upload: ${e}`);
            });
            console.error(`Error trying to save the result of an API call: ${e.message}`);
        }
    }

    private handleRatelimit(ratelimitType: string, methodName: string, startTime: number, countStrings: string[], limitStrings: string[]): RatelimitResult | null {

        let found = false;
        let longestSpreadTime = 0;
        let resultStartTime: number | null = 0;
        let resultRatelimit = 0;

        for (const cString of countStrings) {
            const splitCount = cString.split(":");
            const count = parseInt(splitCount[0].trim(), 10);
            const time = parseInt(splitCount[1].trim(), 10);

            const limit = limitStrings.find((e) => e.indexOf(`:${time}`) !== -1);
            if (!limit) {
                console.warn(`Unable to find limits for the ${ratelimitType} ratelimit with time being ${time} on a result of ${methodName}.`);
                continue;
            }

            const splitLimit = limit.split(":");
            const max = parseInt(splitLimit[0].trim(), 10);

            if (count + 1 >= max) {
                console.warn(`Hit ${ratelimitType} ratelimit with ${methodName}.`);
                return new RatelimitResult(startTime + time * 1000 + ApiUrlInterpreter.ratelimitErrorMs, startTime + time * 1000 + ApiUrlInterpreter.ratelimitErrorMs);
            }

            const spreadTime = 1 / (max / time); // Find the slowest ratelimit.
            if (spreadTime > longestSpreadTime) {

                found = true;
                longestSpreadTime = spreadTime;

                const delay = spreadTime * 1000 + ApiUrlInterpreter.ratelimitErrorMs;
                resultRatelimit = Date.now() + delay;
                if (count <= 1) resultStartTime = Date.now();
                else resultStartTime = null;
            }
        }

        if (found === false) return null;
        return new RatelimitResult(resultRatelimit, resultStartTime);
    }
}
