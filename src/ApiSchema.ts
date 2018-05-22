import Discord = require("discord.js");
import fetch from "node-fetch";

import { SharedSettings } from "./SharedSettings";

import { clearTimeout, setTimeout } from "timers";

class PathRegexCollection {
    public invalid: string;
    public valid: string;

    constructor(validString: string, invalidString: string) {
        this.valid = validString;
        this.invalid = invalidString;
    }
}

class SchemaRegexCollection extends PathRegexCollection {
    public name: string;
    public schema: any;

    constructor(name: string, schema: any, validString: string, invalidString: string) {
        super(validString, invalidString);

        this.name = name;
        this.schema = schema;
    }
}

export class Path {
    public methodType: "GET" | "POST";
    public regex: PathRegexCollection;
    public parameterInfo: SchemaRegexCollection[];
    public method: string;
    public name: string;
}

export class APISchema {

    public paths: Path[] = [];
    public platforms: string[];
    public platformRegexString: string;

    private sharedSettings: SharedSettings;
    private timeOut: NodeJS.Timer | null;

    constructor(sharedSettings: SharedSettings) {
        this.sharedSettings = sharedSettings;
        this.updateSchema();
    }

    public async onUpdateSchemaRequest(message: Discord.Message, isAdmin: boolean, command: string, args: string[]) {
        const replyMessagePromise = message.channel.send("Updating schema..");

        console.log(`${message.author.username} requested a schema update.`);
        await this.updateSchema();

        const newMessage = "Updated schema.";
        const replyMessage = await replyMessagePromise;

        // Could be an array? Would be weird.
        if (Array.isArray(replyMessage)) {
            console.warn("replyMessage is an array, what do you know?");
            replyMessage.forEach(m => m.edit(newMessage));
        } else replyMessage.edit(newMessage);
    }

    public async updateSchema() {
        try {
            const response = await fetch(`http://www.mingweisamuel.com/riotapi-schema/openapi-3.0.0.json`, {
                method: "GET",
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
            });

            if (response.status !== 200) {
                console.error("HTTP Error trying to get schema: " + response.status);
                return;
            }

            const schema = await response.json();

            const baseUrlRegex = this.constructBaseUrlRegex(schema);
            const invalidBaseUrlRegex = this.constructInvalidBaseUrlRegex(schema);

            this.paths = [];

            for (const pathName in schema.paths) {
                const pathSchema = schema.paths[pathName];
                const methodSchema = pathSchema.get ? pathSchema.get : pathSchema.post;

                if (!methodSchema) continue; // Only handle GET/POST
                if (methodSchema.operationId.startsWith("tournament")) continue;

                const path = new Path();
                path.methodType = pathSchema.get ? "GET" : "POST";
                path.method = methodSchema.operationId;
                this.constructRegex(path, baseUrlRegex, invalidBaseUrlRegex, pathName, methodSchema);
                console.assert(path.regex, "Path Regex should be set");

                this.paths.push(path);
            }

            // This fixes the issue where it would match getAllChampionsMasteries before a specific champion mastery (which starts the same but has extra parameters)
            this.paths = this.paths.sort((a, b) => b.name.length - a.name.length);
        } catch (e) {
            console.error("Schema fetch error: " + e.message);
        }

        if (this.timeOut) {
            clearTimeout(this.timeOut);
            this.timeOut = null;
        }
        this.timeOut = setTimeout(this.updateSchema.bind(this), this.sharedSettings.apiUrlInterpreter.timeOutDuration);
    }

    private constructBaseUrlRegex(schema: any): string {
        const baseUrl = this.escapeRegex(schema.servers[0].url);
        this.platforms = schema.servers[0].variables.platform.enum;

        // This makes a regex string from all the platform options
        this.platformRegexString = `(${this.platforms.join("|")})`;

        return baseUrl.replace(/{platform}/g, this.platformRegexString);
    }

    private constructRegex(path: Path, validBase: string, invalidBase: string, pathName: string, methodSchema: any) {

        path.name = pathName;
        path.parameterInfo = [];

        let invalidPath = invalidBase + this.escapeRegex(pathName);
        let validPath = validBase + this.escapeRegex(pathName);

        if (!methodSchema.parameters) {
            path.regex = new PathRegexCollection(validPath, invalidPath);
            return;
        }

        const invalidWith = "([^\\s^\\/]*)";
        for (const parameter of methodSchema.parameters) {
            if (parameter.required === false) continue;

            const parameterReplace = new RegExp(`{${parameter.name}}`, "g");

            let validWith = "([^\\s^\\/]+)";

            if (parameter.schema.enum) {
                validWith = `(${parameter.schema.enum.join("|")})`;
            } else {
                switch (parameter.schema.type) {
                    default:
                        console.warn(`Unhandled schema parameter in ${pathName}: ${parameter.name} is a ${parameter.schema.type}`);
                        break;

                    case "string":
                        break;

                    case "integer":
                        validWith = "([0-9]+)";
                        break;
                }
            }

            invalidPath = invalidPath.replace(parameterReplace, invalidWith);
            validPath = validPath.replace(parameterReplace, validWith);

            path.parameterInfo.push(new SchemaRegexCollection(parameter.name, parameter.schema, validWith, invalidWith));
        }

        validPath += "\\/?"; // Allow urls to end with a trailing /
        validPath += "\\s"; // Message will always end in a whitespace, use this a delimiter at the end of valid paths

        // If the last parameter is missing from the url, don't require the last / match for invalids.
        const lastIndex = invalidPath.lastIndexOf("\\/" + invalidWith);
        if (lastIndex !== -1) {
            invalidPath = invalidPath.substr(0, lastIndex) + "\\/?" + invalidWith;
        }

        path.regex = new PathRegexCollection(validPath, invalidPath);
    }

    private constructInvalidBaseUrlRegex(schema: any): string {
        const baseUrl = this.escapeRegex(schema.servers[0].url);
        return baseUrl.replace(/{platform}/g, "(.*?)");
    }

    private escapeRegex(regex: string): string {
        return regex.replace(/[\-\[\]\/\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
    }
}
