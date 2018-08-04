import Discord = require("discord.js");
import fetch from "node-fetch";
import XRegExp = require("xregexp");

import levenshteinDistance from "./LevenshteinDistance";
import { SharedSettings } from "./SharedSettings";

import { clearTimeout, setTimeout } from "timers";

export class Path {
    public name: string;
    public methodType: "GET" | "POST";
    public regex: RegExp;
    public pathParameters: Map<string, Parameter>;
    public queryParameters: Map<string, Parameter>;
}

export class Parameter {
    public name: string;
    public required: boolean;
    public type: ParameterType;
}

export class ParameterType {
    /** A human readable description (e.g. "a positive integer") */
    public description: string;

    constructor(description: string, isValidValue: (value: string) => boolean){
        this.description = description;
        this.isValidValue = isValidValue;
    }
    /** A function that returns a boolean indicating if the specified value is a valid value for this type of parameter */
    public isValidValue(value: string | string[]): boolean { return false; }
}

export class APISchema {

    private static PARAMETER_TYPES = {
        ANY: new ParameterType("anything", (value) => true),
        STRING: new ParameterType("a string", (value) => !Array.isArray(value)),
        INTEGER: new ParameterType("an integer", (value) => Number.isInteger(+value)),
        BOOLEAN: new ParameterType("a boolean", (value) => value === "true" || value === "false"),
        SET: new ParameterType("a set specified like `paramName=value1&paramName=value2`", (value) => {
            if (Array.isArray(value)) return true;
            // Check if a common delimiter was erroneously specified. If one wasn't, it means the value is likely just a single element in a set.
            return !(value.includes(",") || value.includes("+"));
        }),
    };

    public paths: Path[] = [];
    public platforms: string[];

    private sharedSettings: SharedSettings;
    private timeOut: NodeJS.Timer | null;

    constructor(sharedSettings: SharedSettings) {
        this.sharedSettings = sharedSettings;
        this.updateSchema();
    }

    public getClosestPlatform(platformParam: string) {
        const validPlatform = this.platforms.includes(platformParam.toLowerCase());
        if (validPlatform) return null;

        return this.platforms.map(p => {
            return {
                platform: p,
                distance: levenshteinDistance(platformParam, p),
            };
        }).sort((a, b) => a.distance - b.distance)[0].platform;
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

            this.platforms = schema.servers[0].variables.platform.enum;
            this.paths = [];

            for (const pathName in schema.paths) {
                const pathSchema = schema.paths[pathName];
                const methodSchema = pathSchema.get ? pathSchema.get : pathSchema.post;

                if (!methodSchema) continue; // Only handle GET/POST
                if (methodSchema.operationId.startsWith("tournament-v3")) continue;

                const path = new Path();
                path.name = pathName;
                path.methodType = pathSchema.get ? "GET" : "POST";
                path.regex = this.constructRegex(pathName, methodSchema);

                path.queryParameters = new Map();
                path.pathParameters = new Map();
                if (methodSchema.parameters) {
                    for (const parameter of methodSchema.parameters) {
                        if (parameter.in === "path") {
                            this.addParameter(path.pathParameters, parameter);
                        } else if (parameter.in === "query") {
                            this.addParameter(path.queryParameters, parameter);
                        } else {
                            console.warn(`Unknown parameter location "${parameter.in}"`);
                        }
                    }
                }

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

    /**
     * Constructs a regex that will match an API endpoint and store each path parameter in a named group.
     */
    private constructRegex(path: string, methodSchema: any): RegExp {
        // Allow an optional trailing slash
        let regex = path + "/?";
        // Escape slashes
        regex = regex.replace(/\//g, "\\/");
        // Replace each parameter with a named regex group
        regex = regex.replace(/\{(.*?)\}/, (match, p2) => `(?<${p2}>[^\\/?\\s]*)`);

        return XRegExp(regex);
    }

    private addParameter(map: Map<string, Parameter>, parameterSchema: any) {
        const parameter = new Parameter();
        parameter.name = parameterSchema.name;
        parameter.required = parameterSchema.required;
        parameter.type = this.getParameterType(parameterSchema.schema.type);

        map.set(parameter.name, parameter);
    }

    private getParameterType(type: string): ParameterType {
        switch (type) {
            case "integer":
                return APISchema.PARAMETER_TYPES.INTEGER;
            case "string":
                return APISchema.PARAMETER_TYPES.STRING;
            case "boolean":
                return APISchema.PARAMETER_TYPES.BOOLEAN;
            case "array":
                return APISchema.PARAMETER_TYPES.SET;
            default:
                console.warn(`No suitable ParameterType found for parameter "${type}" - defaulting to any type`);
                return APISchema.PARAMETER_TYPES.ANY;
        }
    }
}
