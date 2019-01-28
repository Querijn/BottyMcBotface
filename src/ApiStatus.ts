import * as prettyMs from "pretty-ms";
import APIStatusAPI, { APIStatus } from "./ApiStatusApi";
import { SharedSettings } from "./SharedSettings";

import Discord = require("discord.js");

/**
 * Map from API name (e.g. champion-mastery-v4) to the string used in the embed field.
 * Only APIs with issues (troubled/down) are stored.
 *
 * @interface ApiStates
 */
interface ApiStates {
    [key: string]: string;
}

interface StatusEmbedState {
    api: ApiStates;
    onFire: boolean;
    allApisOK: boolean;
    allApisIssues: boolean;
}

export default class ApiStatus {
    private bot: Discord.Client;
    private sharedSettings: SharedSettings;
    private apiStatusAPI: APIStatusAPI;

    private lastCheckTime: number;
    private currentStatus: StatusEmbedState;

    constructor(sharedSettings: SharedSettings) {
        this.sharedSettings = sharedSettings;
        this.lastCheckTime = 0;
        this.apiStatusAPI = new APIStatusAPI(this.sharedSettings.apiStatus.statusUrl, this.sharedSettings.apiStatus.checkInterval);
    }

    public async onStatus(message: Discord.Message, isAdmin: boolean, command: string, args: string[]) {
        const apiStatus = await this.getApiStatus();

        const fields: {
            name: string,
            value: string,
            inline: boolean,
        }[] = [];

        for (const api in apiStatus.api) {
            fields.push({ name: api, value: apiStatus.api[api], inline: true });
        }

        if (!apiStatus.allApisIssues) {
            fields.push({
                inline: true,
                name: apiStatus.allApisOK ? "All APIs" : "All other APIs",
                value: ":white_check_mark:",
            });
        }

        // fixes formatting with empty fields
        while (fields.length % 3 !== 0) {
            fields.push({
                inline: true,
                name: "\u200b",
                value: "\u200b",
            });
        }

        const embedContent: any = {
            author: {
                icon_url: "http://ddragon.leagueoflegends.com/cdn/7.20.2/img/champion/Heimerdinger.png",
                name: "API Status",
                url: "https://developer.riotgames.com/api-status/",
            },
            color: 0xe74c3c,
            fields,
        };

        if (apiStatus.onFire) {
            embedContent.image = { url: this.pickRandomOnFireImage() };
        }

        try {
            await message.channel.send({ embed: embedContent });
        }
        catch (e) {
            if (e instanceof Discord.DiscordAPIError) {
                console.error(`Received DiscordAPIError while returning the current API status: ${e.code} "${e.message}"`);
            }
            else {
                console.error(`Received unknown error while returning the current API status: ${e}"`);
            }
        }
    }

    private async getApiStatus(): Promise<StatusEmbedState> {
        // cache embed state
        const timeDiff = Date.now() - this.lastCheckTime;
        if (timeDiff > this.sharedSettings.apiStatus.checkInterval) {
            const apiStatus = await this.apiStatusAPI.getApiStatus();
            this.currentStatus = this.parseApiStatus(apiStatus);
            this.lastCheckTime = Date.now();
        }

        return this.currentStatus;
    }

    private parseApiStatus(apiStatus: APIStatus): StatusEmbedState {
        const cacheObject: { [key: string]: any } = {};

        let onFire = false;
        let allApisOK = true;
        let allApisIssues = false;
        let apiIssuesCounter = 0;
        let apiCounter = 0;
        const statusEmbed: StatusEmbedState = { api: {}, onFire: false, allApisOK: true, allApisIssues: false };

        for (const api in apiStatus) {
            const regionStates: { troubled: string[], up: string[], down: string[] } = { troubled: [], up: [], down: [] };
            let regionCounter = 0;

            for (const region in apiStatus[api]) {
                const regionState = apiStatus[api][region];
                regionStates[regionState.state].push(region);
                regionCounter++;
            }

            cacheObject[api] = {};
            let retStr = "";
            if (regionStates.troubled.length > 0) {
                allApisOK = false;
                retStr += ":warning: " + this.joinRegions(regionStates.troubled) + "\n";
            }
            if (regionStates.down.length > 0) {
                allApisOK = false;
                retStr += ":x: " + this.joinRegions(regionStates.down) + "\n";
            }
            if (regionStates.up.length > 0) {
                allApisIssues = false;
            }
            apiIssuesCounter += regionStates.troubled.length + regionStates.down.length;
            apiCounter += regionStates.troubled.length + regionStates.down.length + regionStates.up.length;

            // API on fire, if all regions for one api have issues
            if (regionStates.troubled.length + regionStates.down.length === regionCounter) {
                onFire = true;
            }

            // only add api if it has issues
            if (regionStates.troubled.length + regionStates.down.length > 0) {
                statusEmbed.api[api] = retStr;
            }
        }

        const issueRate = ((apiIssuesCounter / apiCounter) || 0);
        statusEmbed.onFire = onFire || issueRate > this.sharedSettings.apiStatus.apiOnFireThreshold;
        statusEmbed.allApisOK = allApisOK;
        statusEmbed.allApisIssues = allApisIssues;
        return statusEmbed;
    }

    private joinRegions(arr: string[]): string {
        let retStr = "";
        for (let j = 0; j < arr.length; j++) {
            const a = arr[j];
            retStr += a + (j < arr.length - 1 ? ", " : "");

            if (j % 4 === 3) {
                retStr += "\n";
            }
        }

        if (retStr.length === 0)
            return "None";
        return retStr;
    }

    private pickRandomOnFireImage(): string {
        // get rand in [0, number of on fire images - 1]
        const rand = Math.floor(Math.random() * this.sharedSettings.apiStatus.onFireImages.length);
        return this.sharedSettings.apiStatus.onFireImages[rand];
    }
}
