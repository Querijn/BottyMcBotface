import Discord = require("discord.js");
import prettyMs = require("pretty-ms");
import { Response } from "node-fetch";
import fetch from "node-fetch";
import fs = require("fs");

import { fileBackedObject } from "./FileBackedObject";
import { SharedSettings } from "./SharedSettings";
import { PersonalSettings } from "./PersonalSettings";
import { setTimeout, clearTimeout } from "timers";
import { platform } from "os";
import levenshteinDistance from "./LevenshteinDistance";
import { ENODATA } from "constants";

class PathRegexCollection {
    constructor(validString: string, invalidString: string) {
        this.valid = validString;
        this.invalid = invalidString;
    }

    public invalid: string;
    public valid: string;
};

class SchemaRegexCollection extends PathRegexCollection {
    constructor(name: string, schema: any, validString: string, invalidString: string) {
        super(validString, invalidString);

        this.name = name;
        this.schema = schema;
    }
    
    public name: string;
    public schema: any;
};

class RatelimitResult {
    constructor(rateLimit: number, startTime: number|null) {
        this.rateLimit = rateLimit;
        this.startTime = startTime;
    }

    public rateLimit: number;
    public startTime: number|null;
};

class Path {
    public methodType: "GET"|"POST";
    public regex: PathRegexCollection;
    public parameterRegexMatches: SchemaRegexCollection[];
    public method: string;
    public name: string;
};

export default class ApiUrlInterpreter {
    private static ratelimitErrorMs = 100;
    
    private bot: Discord.Client;
    private sharedSettings: SharedSettings;
    private personalSettings: PersonalSettings;
    private timeOut: NodeJS.Timer|null;
    private iterator: number = 1;

    private baseUrl: string;
    private platforms: string[];
    private platformRegexString: string;

    private applicationRatelimitLastTime: number = 0;
    private methodRatelimitLastTime: {[method: string]: number} = {};
    private applicationStartTime: number = 0;
    private methodStartTime: {[method: string]: number} = {};

    private paths: Path[] = [];

    private fetchSettings: Object;

    constructor(bot: Discord.Client, personalSettings: PersonalSettings, sharedSettings: SharedSettings) {
        console.log("Requested API URL Interpreter extension..");

        this.sharedSettings = sharedSettings;
        this.personalSettings = personalSettings;
        console.log("Successfully loaded API URL Interpreter settings.");

        this.fetchSettings = { 
            headers: { 
                "X-Riot-Token": this.personalSettings.riotApi.key 
            }
        };

        this.bot = bot;
        this.bot.on("ready", this.onBot.bind(this));
        this.bot.on("message", this.onMessage.bind(this));

        this.updateSchema();
    }

    onBot() {
        console.log("API URL Interpreter extension loaded.");
    }

    onMessage(message: Discord.Message) {
        if (message.author.bot) return; 

        this.onUpdateSchemaRequest(message);

        this.onRiotApiURL(message);
    }

    async onRiotApiURL(message: Discord.Message, content: string|null = null) {
        
        // Init message if missing.
        if (!content) content = message.content.replace(/(`){1,3}(.*?)(`){1,3}/g, "");

        if (content.indexOf("https://") == -1) return; // We're about to do ~80 regex tests, better make sure that it's on a message with a URL

        for (let i = 0; i < this.paths.length; i++) {
            const path = this.paths[i];

            const validMatch = new RegExp(path.regex.valid, "g").exec(content);
            if (validMatch && validMatch.length > 0) {

                let replyMessageContent = `Making a request to ${path.method}..`;

                const replyMessages = await message.channel.send(replyMessageContent);
                const replyMessage = Array.isArray(replyMessages) ? replyMessages[0] : replyMessages;

                const region = validMatch[1];
                await this.makeRequest(path, region, validMatch[0], replyMessage);
                return;
            }
        }

        for (let i = 0; i < this.paths.length; i++) {
            const path = this.paths[i];
            
            const invalidMatch = new RegExp(path.regex.invalid, "g").exec(content);
            if (invalidMatch && invalidMatch.length > 0) {

                let replyMessageContent = "I see you've posted a Riot Games API url, but I was expecting it to have a slightly different format:\n";

                // Get closest platform if incorrect
                const closestPlatform = this.getClosestPlatform(invalidMatch[1]);
                if (closestPlatform) {
                    replyMessageContent += `- The platform \`${invalidMatch[1]}\` is invalid, did you mean: \`${closestPlatform}\`? Expected one of the following values: \`${this.platforms.join(", ")}\`\n`;
                }

                invalidMatch.splice(0, 2); // Remove url and platform from array
                
                // This now contains all required parameters.
                for (let j = 0; j < Math.max(path.parameterRegexMatches.length, invalidMatch.length); j++) {
                    
                    const parameter = path.parameterRegexMatches[j];
                    const value = invalidMatch[j];

                    const parameterCorrect = new RegExp(parameter.valid, "g").exec(value);
                    if (parameterCorrect) continue;

                    // Find the location of the parameter in the URL
                    const start = path.name.indexOf(`/{${parameter.name}}`); // Find /${leagueId}
                    const end = path.name.lastIndexOf("/", start - 1); // Find the / before it
                    let location = path.name.substr(end + 1, start - end); // Make a `leagues/` string.
                    
                    replyMessageContent += `- Parameter ${j + 1}, expected \`${parameter.name} (${parameter.schema.type})\` right after \`${location}\`, got "${value}".\n`;
                }

                message.channel.send(replyMessageContent);
                return;
            }
        }
    }

    getClosestPlatform(platform: string) {
        const validPlatform = new RegExp(this.platformRegexString, "g").exec(platform);
        if (validPlatform) return null;
        
        return this.platforms.map(p => { 
            return { 
                platform: p, 
                distance: levenshteinDistance(platform, p) 
            }
        })
        .sort((a, b) => a.distance - b.distance)[0].platform;
    }

    async onUpdateSchemaRequest(message: Discord.Message) {
        if (message.content.startsWith("!update_schema") == false) return;

        const replyMessagePromise = message.channel.send("Updating schema..");

        console.log(`${message.author.username} requested a schema update.`);
        await this.updateSchema();

        const newMessage = "Updated schema.";
        let replyMessage = await replyMessagePromise;

        // Could be an array? Would be weird.
        if (Array.isArray(replyMessage)) {
            console.warn("replyMessage is an array, what do you know?");
            for (let i = 0; i < replyMessage.length; i++) {
                replyMessage[i].edit(newMessage);
            }
        }
        else replyMessage.edit(newMessage);
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

            fs.writeFile(localFile, JSON.stringify(json), null, (err: NodeJS.ErrnoException) =>
            {
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

    handleRatelimit(ratelimitType: string, methodName: string, startTime: number, countStrings: string[], limitStrings: string[]): RatelimitResult|null {
        
        let found = false;
        let longestSpreadTime = 0;
        let resultStartTime: number|null = 0;
        let resultRatelimit = 0;

        for (let i = 0; i < countStrings.length; i++) {
            const splitCount = countStrings[i].split(":");
            const count = parseInt(splitCount[0].trim());
            const time = parseInt(splitCount[1].trim());
            
            const limit = limitStrings.find(function(element) {
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

    async updateSchema() {
        try { 
            const response = await fetch(`http://www.mingweisamuel.com/riotapi-schema/openapi-3.0.0.json`, {
                method: "GET",
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json"
                }
            });

            if (response.status !== 200) {
                console.error("HTTP Error trying to get schema: " + response.status);
                return;
            }

            let schema = await response.json();

            let baseUrlRegex = this.constructBaseUrlRegex(schema);
            let invalidBaseUrlRegex = this.constructInvalidBaseUrlRegex(schema);

            this.paths = [];
            
            for (const pathName in schema.paths) {
                const pathSchema = schema.paths[pathName];
                const methodSchema = pathSchema.get ? pathSchema.get : pathSchema.post;

                if (!methodSchema) continue; // Only handle GET/POST
                if (methodSchema.operationId.startsWith("tournament")) continue;

                let path = new Path();
                path.methodType = pathSchema.get ? "GET" : "POST";
                path.method = methodSchema.operationId;
                this.constructRegex(path, baseUrlRegex, invalidBaseUrlRegex, pathName, methodSchema);
                console.assert(path.regex, "Path Regex should be set");
                
                this.paths.push(path);
            }
        }
        catch (e) {
            console.error("Schema fetch error: " + e.message);
        }

        if (this.timeOut) {
            clearTimeout(this.timeOut);
            this.timeOut = null;
        }
        this.timeOut = setTimeout(this.updateSchema.bind(this), this.sharedSettings.apiUrlInterpreter.timeOutDuration);
    }

    constructBaseUrlRegex(schema: any): string {
        let baseUrl = this.escapeRegex(schema.servers[0].url);
        this.platforms = schema.servers[0].variables.platform.enum;

        // This makes a regex string from all the platform options
        this.platformRegexString = `(${this.platforms.join("|")})`;

        return baseUrl.replace(/{platform}/g, this.platformRegexString);
    }

    constructInvalidBaseUrlRegex(schema: any): string {
        let baseUrl = this.escapeRegex(schema.servers[0].url);
        return baseUrl.replace(/{platform}/g, "(.*?)");
    }

    constructRegex(path: Path, validBase: string, invalidBase: string, pathName: string, methodSchema: any) {
        
        path.name = pathName;
        path.parameterRegexMatches = [ ];

        let invalidPath = invalidBase + this.escapeRegex(pathName);
        let validPath = validBase + this.escapeRegex(pathName);

        if (!methodSchema.parameters) {
            path.regex = new PathRegexCollection(validPath, invalidPath);
            return;
        }

        for (let i = 0; i < methodSchema.parameters.length; i++) {

            const parameter = methodSchema.parameters[i];
            if (parameter.required == false) continue;

            const parameterReplace = new RegExp(`{${parameter.name}}`, "g");

            const invalidWith = "(.*?)";
            let validWith = "(.+?)";

            if (parameter.schema.enum) {
                validWith = `(${parameter.schema.enum.join("|")})`;
            }
            else switch(parameter.schema.type) {
                default:
                    console.warn(`Unhandled schema parameter in ${pathName}: ${parameter.name} is a ${parameter.schema.type}`);
                    break;

                case "string":
                    break;

                case "integer":
                    validWith = "([0-9]+)";
                    break;
            }

            invalidPath = invalidPath.replace(parameterReplace, invalidWith);
            validPath = validPath.replace(parameterReplace, validWith);

            path.parameterRegexMatches.push(new SchemaRegexCollection(parameter.name, parameter.schema, validWith, invalidWith));
        }

        path.regex = new PathRegexCollection(validPath, invalidPath);
    }
    
    escapeRegex(regex: string): string {
        return regex.replace(/[\-\[\]\/\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
    }
}
