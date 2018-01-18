import Discord = require("discord.js");
import prettyMs = require("pretty-ms");
import fetch from "node-fetch";

import { fileBackedObject } from "./FileBackedObject";
import { SharedSettings } from "./SharedSettings";
import { PersonalSettings } from "./PersonalSettings";
import { setTimeout, clearTimeout } from "timers";
import { platform } from "os";

class PathRegexCollection {
    constructor(validString: string, invalidString: string) {
        this.valid = new RegExp(validString, "g");
        this.invalid = new RegExp(invalidString, "g");
    }

    public invalid: RegExp;
    public valid: RegExp;
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
    public method: string;
};

export default class ApiUrlInterpreter {
    private static ratelimitErrorMs = 100;
    
    private bot: Discord.Client;
    private sharedSettings: SharedSettings;
    private personalSettings: PersonalSettings;
    private timeOut: NodeJS.Timer|null;

    private baseUrl: string;
    private platforms: string[];

    private applicationRatelimit: number = 0;
    private methodRatelimit: {[method: string]: number} = {};
    private applicationStartTime: number = Date.now();
    private methodStartTime: {[method: string]: number} = {};

    private paths: Path[] = [];

    constructor(bot: Discord.Client, personalSettings: PersonalSettings, sharedSettings: SharedSettings) {
        console.log("Requested API URL Interpreter extension..");

        this.sharedSettings = sharedSettings;
        this.personalSettings = personalSettings;
        console.log("Successfully loaded API URL Interpreter settings.");

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

            const validMatch = content.match(path.regex.valid);
            if (validMatch && validMatch.length > 0) {

                let replyMessageContent = (validMatch.length != 1) ?
                    "Found multiple links of the same method, gonna request just the first one." : 
                    `Making a request to ${path.method}..`;

                const replyMessages = await message.channel.send(replyMessageContent);
                const replyMessage = Array.isArray(replyMessages) ? replyMessages[0] : replyMessages;

                await this.makeRequest(path, validMatch[0], replyMessage);
                break;
            }

            const invalidMatch = content.match(path.regex.invalid);
            if (invalidMatch && invalidMatch.length > 0) {
                debugger;
                break;
            }
        }
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

    async makeRequest(path: Path, url: string, message: Discord.Message) {
        
        const currentTime = Date.now();
        if (currentTime < this.applicationRatelimit) {
            const timeDiff = prettyMs(this.applicationRatelimit - currentTime, { verbose: true });
            message.edit(`We are ratelimited, please wait ${timeDiff}.`);
            return;
        }

        if (this.methodRatelimit[path.method] && currentTime < this.methodRatelimit[path.method]) {
            const timeDiff = prettyMs(this.methodRatelimit[path.method] - currentTime, { verbose: true });
            message.edit(`We are ratelimited, please wait ${timeDiff}.`);
            return;
        }
        
        const resp = await fetch(url, {
            headers: {
                "X-Riot-Token": this.personalSettings.riotApi.key
            }
        });

        if (!this.methodStartTime[path.method]) {
            this.methodStartTime[path.method] = Date.now();
        }

        // Update application ratelimit
        {
            const appCountStrings = resp.headers.get("x-app-rate-limit-count").split(",");
            const appLimitStrings = resp.headers.get("x-app-rate-limit").split(",");
            const appResult = this.handleRatelimit("application", path.method, this.applicationStartTime, appCountStrings, appLimitStrings);

            if (appResult) {
                this.applicationRatelimit = appResult.rateLimit;
                if (appResult.startTime !== null) this.applicationStartTime = appResult.startTime;
            }
        }

        // Update method ratelimit
        {
            const methodCountStrings = resp.headers.get("x-method-rate-limit-count").split(",");
            const methodLimitStrings = resp.headers.get("x-method-rate-limit").split(",");
            const methodResult = this.handleRatelimit("method", path.method, this.methodStartTime[path.method], methodCountStrings, methodLimitStrings);

            if (methodResult) {
                this.methodRatelimit[path.method] = methodResult.rateLimit;
                if (methodResult.startTime !== null) this.methodStartTime[path.method] = methodResult.startTime;
            }
        }

        if (resp.status != 200) {
            message.edit(`The Riot API responded to ${url} with ${resp.status} ${resp.statusText}.`);
            return;
        }

        // TODO: Message is good here, reply with upload
    }

    handleRatelimit(ratelimitType: string, methodName: string, startTime: number, countStrings: string[], limitStrings: string[]): RatelimitResult|null {
        
        let found = false;
        let lowestRequestsPerSecond = 5e5;
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

            if (count + 1 == max) {
                console.warn(`Hit ${ratelimitType} ratelimit with ${methodName}.`);
                return new RatelimitResult(startTime + time * 1000 + ApiUrlInterpreter.ratelimitErrorMs, startTime + time * 1000 + ApiUrlInterpreter.ratelimitErrorMs);
            }

            const requestsPerSecond = max / time; // Find the slowest ratelimit.
            if (requestsPerSecond < lowestRequestsPerSecond) {

                found = true;
                lowestRequestsPerSecond = requestsPerSecond;

                resultRatelimit = Date.now() + requestsPerSecond * 1000 + ApiUrlInterpreter.ratelimitErrorMs;
                if (count <= 1) resultStartTime = Date.now();
                else resultStartTime = null;
            }
        }

        if (found == false) return null;
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

            let paths: Path[] = [];
            
            for (const pathName in schema.paths) {
                const pathSchema = schema.paths[pathName];
                const methodSchema = pathSchema.get ? pathSchema.get : pathSchema.post;

                if (!methodSchema) continue; // Only handle GET/POST
                if (methodSchema.operationId.startsWith("tournament")) continue;

                let path = new Path();
                path.methodType = pathSchema.get ? "GET" : "POST";
                path.method = methodSchema.operationId;
                path.regex = this.constructRegex(baseUrlRegex + this.escapeRegex(pathName), methodSchema);

                paths.push(path);
            }

            this.paths = paths;
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
        const platforms = schema.servers[0].variables.platform.enum;

        // This makes a regex string from all the platform options
        let platformRegexString = "(";
        for (let i = 0; i < platforms.length; i++) {
            platformRegexString += platforms[i];
            if (i + 1 != platforms.length) 
                platformRegexString += "|";
        }
        platformRegexString += ")";

        return baseUrl.replace(/{platform}/g, platformRegexString);
    }

    constructRegex(pathName: string, methodSchema: any): PathRegexCollection {
        
        let returns: PathRegexCollection[] = [];

        let invalidPath = pathName;
        let validPath = pathName;

        if (!methodSchema.parameters)
            return new PathRegexCollection(validPath, invalidPath);

        for (let i = 0; i < methodSchema.parameters.length; i++) {

            const parameter = methodSchema.parameters[i];
            if (parameter.required == false) continue;

            const parameterReplace = new RegExp(`{${parameter.name}}`, "g");

            const invalidWith = "(.*?)";
            let validWith = "(.*?)";

            switch(parameter.schema.type) {
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
        }

        return new PathRegexCollection(validPath, invalidPath);
    }
    
    escapeRegex(regex: string): string {
        return regex.replace(/[\-\[\]\/\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
    }
}
