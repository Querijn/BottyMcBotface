import Discord = require("discord.js");
import fetch from "node-fetch";
import { fileBackedObject } from "./FileBackedObject";
import { PersonalSettings, SharedSettings } from "./SharedSettings";
import levenshteinDistance from "./LevenshteinDistance";
import { setTimeout } from "timers";

type EndpointName = string;
type Endpoints = EndpointName[];

interface EndpointsState {
    endpoints: Endpoints;
    lastUpdate: Date;
}

/**
 *  Posts links to api endpoints
 *
 */
export default class Endpoint {
    private endpoints: EndpointsState;
    private baseUrl: string;
    private maxDistance: number;
    private aliases: { [key: string]: string[] };
    private timeOut: NodeJS.Timer | null;
    private timeOutDuration: number;

    public constructor(sharedSettings: SharedSettings, endpointFile: string) {
        console.log("Requested Endpoint extension.");
        this.baseUrl = sharedSettings.endpoint.baseUrl;
        this.maxDistance = sharedSettings.endpoint.maxDistance;
        this.aliases = sharedSettings.endpoint.aliases || {};
        this.timeOutDuration = sharedSettings.endpoint.timeOutDuration;
        this.endpoints = fileBackedObject(endpointFile);
        this.updateEndpoints();
    }

    public onEndpoint(message: Discord.Message, isAdmin: boolean, command: string, args: string[]) {
        if (this.endpoints.endpoints === undefined) {
            message.reply("Sorry, endpoints are not yet initialized!");
            return;
        }
        const argsString = args.reduce((prev, current) => prev + current, "");
        let minDist = Infinity;
        let minEndpoint = null;

        for (const endpoint of this.endpoints.endpoints) {
            const dist = this.calculateEndpointAndSynonymsDist(endpoint, argsString);
            if (dist < minDist) {
                minDist = dist;
                minEndpoint = endpoint;
            }
        }

        if (minEndpoint != null && minDist < this.maxDistance) {
            message.reply(this.baseUrl + minEndpoint);
        } else {
            message.reply("Could not find requested endpoint!");
        }
    }

    /**
     * Levenshtein Distance with some simple modifications for endpoint & input
     * @param endpoint
     * @param input
     */
    private calculateDistance(endpoint: string, input: string): number {
        endpoint = endpoint.replace(new RegExp("-", "g"), " ");
        input = input.replace(new RegExp("-", "g"), " ");
        return levenshteinDistance(endpoint, input);
    }

    /**
     *
     * @param endpoint
     * @param compareString
     * @returns minimum distance between endpoint/endpoint synonym and compare string
     */
    private calculateEndpointAndSynonymsDist(endpoint: string, argsString: string): number {
        const endpointComponents = endpoint.split("-");
        const version = endpointComponents[endpointComponents.length - 1];
        let compareString = argsString;
        if (!argsString.endsWith(version)) {
            compareString = argsString + "-" + version;
        }

        let dist = this.calculateDistance(endpoint, compareString);

        if (endpoint.startsWith("lol")) {
            const aliasDist = this.calculateDistance(endpoint.replace("lol", ""), compareString);
            dist = Math.min(dist, aliasDist);
        }

        // check for manually defined aliases
        if (!this.aliases || !this.aliases[endpoint]) {
            return dist;
        }

        for (const alias of this.aliases[endpoint]) {
            const aliasDist = this.calculateDistance(alias + "-" + version, compareString);
            dist = Math.min(dist, aliasDist);
        }
        return dist;
    }

    private async updateEndpoints() {
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
            const paths = schema.paths;

            const endpointSet = new Set<EndpointName>();

            for (const path in paths) {
                const endpointName = paths[path]["x-endpoint"]; // match-v3
                endpointSet.add(endpointName);
            }

            this.endpoints.lastUpdate = new Date();
            // we have to create a copy of the set because the file backed object proxy does not serialize sets properly
            this.endpoints.endpoints = new Array(endpointSet.size);
            {
                let i = 0;
                for (const endpoint of endpointSet) {
                    this.endpoints.endpoints[i] = endpoint;
                    i++;
                }
            }
            console.log("Updated endpoints!", this.endpoints.endpoints);
        } catch (e) {
            console.error("Schema fetch error: " + e.message);
            throw e;
        }

        if (this.timeOut) {
            clearTimeout(this.timeOut);
            this.timeOut = null;
        }

        this.timeOut = setTimeout(this.updateEndpoints.bind(this), this.timeOutDuration);
    }
}
