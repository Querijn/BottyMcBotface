import Discord = require("discord.js");
import XRegExp = require("xregexp");

import { levenshteinDistance } from "./LevenshteinDistance";
import { SharedSettings } from "./SharedSettings";

import { clearTimeout, setTimeout } from "timers";

export class Path {
    /**
     * Constructs a regex that will match an API endpoint and store each path parameter in a named group.
     */
    public static constructRegex(path: string, methodSchema: any): RegExp {
        // Allow an optional trailing slash
        let regex = path + "/?";
        // Escape slashes
        regex = regex.replace(/\//g, "\\/");
        // Replace each parameter with a named regex group
        while (regex.match(/\{(.*?)\}/))
            regex = regex.replace(/\{(.*?)\}/, (match, p2) => `(?<${p2}>[^\\/?\\s]*)`);

        return XRegExp(regex + "$");
    }

    public name: string;
    public methodType: "GET" | "POST";
    public regex: RegExp;
    public pathParameters: Map<string, Parameter> = new Map();
    public queryParameters: Map<string, Parameter> = new Map();
    public platformsAvailable: Set<string>;
    /** Indicates if Botty may make calls to the API method. This will be `false` if Botty doesn't have access to the API or if there are other concerns. */
    public canUse: boolean;

    public constructor(name: string, methodSchema: any, methodType: "GET" | "POST") {
        this.name = name;
        this.methodType = methodType;
        this.canUse = !methodSchema.operationId.startsWith("tournament-v4");

        this.regex = Path.constructRegex(name, methodSchema);

        if (methodSchema.parameters) {
            for (const parameter of methodSchema.parameters) {
                this.addParameter(parameter.in, parameter);
            }
        }
        if (methodSchema['x-platforms-available']) {
            this.platformsAvailable = new Set(methodSchema['x-platforms-available']);
        }
    }

    public addParameter(type: "query" | "path", parameterSchema: any) {
        const parameter = new Parameter(parameterSchema);

        let map: Map<string, Parameter>;
        if (type === "path") {
            map = this.pathParameters;
        } else if (type === "query") {
            map = this.queryParameters;
        } else if (type === "header") {
            return; // TODO
        } else {
            console.warn(`Unknown parameter location "${type}"`);
            return;
        }

        map.set(parameter.name, parameter);
    }
}

export class Parameter {
    public name: string;
    public required: boolean;
    public type: ParameterType;

    public constructor(parameterSchema: any) {
        this.name = parameterSchema.name;
        this.required = parameterSchema.required;
        this.type = ParameterType.getParameterType(parameterSchema.schema.type);
    }
}

export class ParameterType {
    public static getParameterType(type: string): ParameterType {
        switch (type) {
            case "integer":
                return ParameterType.PARAMETER_TYPES.INTEGER;
            case "string":
                return ParameterType.PARAMETER_TYPES.STRING;
            case "boolean":
                return ParameterType.PARAMETER_TYPES.BOOLEAN;
            case "array":
                return ParameterType.PARAMETER_TYPES.SET;
            default:
                console.warn(`No suitable ParameterType found for parameter "${type}" - defaulting to any type`);
                return ParameterType.PARAMETER_TYPES.ANY;
        }
    }

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

    /** A human readable description (e.g. "a positive integer") */
    public description: string;

    constructor(description: string, isValidValue: (value: string) => boolean) {
        this.description = description;
        this.isValidValue = isValidValue;
    }

    /** A function that returns a boolean indicating if the specified value is a valid value for this type of parameter */
    public isValidValue(value: string | string[]): boolean { return false; }
}

export class APISchema {
    public paths: Path[] = [];
    public platforms: string[];

    private sharedSettings: SharedSettings;
    private timeOut: NodeJS.Timeout | null;

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
        if (!message.channel.isSendable()) return;
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

            // TODO: schema type
            const schema = <any>(await response.json());

            this.platforms = schema.servers[0].variables.platform.enum;
            this.paths = [];

            for (const pathName in schema.paths) {
                const pathSchema = schema.paths[pathName];
                const methodSchema = pathSchema.get ? pathSchema.get : pathSchema.post;

                if (!methodSchema) continue; // Only handle GET/POST

                this.paths.push(new Path(pathName, methodSchema, pathSchema.get ? "GET" : "POST"));
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
}
