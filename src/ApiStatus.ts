import { fileBackedObject } from "./FileBackedObject";
import { SharedSettings } from "./SharedSettings";
import APIStatusAPI, {APIStatus} from './ApiStatusApi';

import Discord = require("discord.js");

// map from api name (e.g. champion-mastery-v3) to the string used in the embed field
// only apis with issues (troubled/down) are stored
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
    private command: string;
    private apiStatusAPI: APIStatusAPI

    private lastCheckTime: number;
    private currentStatus: StatusEmbedState;

    constructor(bot: Discord.Client, sharedSettings: SharedSettings) {
        console.log("Requested API Status extension..");
        this.bot = bot;
        this.command = sharedSettings.apiStatus.command;

        this.sharedSettings = sharedSettings;
        this.lastCheckTime = 0;
        this.apiStatusAPI = new APIStatusAPI(this.sharedSettings.apiStatus.statusUrl, this.sharedSettings.apiStatus.checkInterval);

        this.bot.on("ready", this.onBot.bind(this));
        this.bot.on("message", this.onInfo.bind(this));
    }

    onBot() {
        console.log("API Status extension loaded.");
    }

    async onInfo(message: Discord.Message) {
        if (message.author.bot) return;

        const content = message.cleanContent;
        if (!this.isApiStatusCommand(content))
            return;

        let apiStatus = await this.getApiStatus();

        let fields: Array<{name: string, value: string, inline: boolean}> = [];
        for (let api in apiStatus.api){ 
            fields.push({name: api, value: apiStatus.api[api], inline: true})
        }

        if (!apiStatus.allApisIssues) {
            fields.push({
                "name": apiStatus.allApisOK ? "All APIs" : "All other APIs",
                "value": ":white_check_mark:",
                "inline": true
            })
        }

        // fixes formatting with empty fields
        while (fields.length % 3 != 0) {
            fields.push({
              "name": "\u200b",
              "value": "\u200b",
              "inline": true
            })
        }

        let embedContent: any = {
            color: 0xe74c3c,
            author: {
                icon_url: "http://ddragon.leagueoflegends.com/cdn/7.20.2/img/champion/Heimerdinger.png",
                name: "API Status",
                url: "https://developer.riotgames.com/api-status/"
            },
            fields: fields
        }

        if (apiStatus.onFire) {
            embedContent.image = { url: this.pickRandomOnFireImage() };
        }

        message.channel.send({embed: embedContent});
    }

    private async getApiStatus(): Promise<StatusEmbedState> {
        // cache embed state
        let timeDiff = Date.now() - this.lastCheckTime;
        if (timeDiff > this.sharedSettings.apiStatus.checkInterval) {
            let apiStatus = await this.apiStatusAPI.getApiStatus();
            this.currentStatus = this.parseApiStatus(apiStatus);
            this.lastCheckTime = Date.now();            
        }

        return this.currentStatus;
    }

    private parseApiStatus(apiStatus: APIStatus): StatusEmbedState {
        let cacheObject: { [key: string]: any } = {};

        let onFire = false;
        let allApisOK = true;
        let allApisIssues = false;
        let apiIssuesCounter = 0;
        let apiCounter = 0;
        let statusEmbed: StatusEmbedState = { api: {}, onFire: false, allApisOK: true, allApisIssues: false};

        type RegionState = {"troubled": Array<string>, "up": Array<string>, "down": Array<string>};

        for (let api in apiStatus) {
            let regionStates: RegionState  = {"troubled": [], "up": [], "down": []};
            let regionCounter = 0;
            for (let region in apiStatus[api]) {
                let regionState = apiStatus[api][region];
                regionStates[regionState.state].push(region);
                regionCounter++;
            }

            cacheObject[api] = {};
            let retStr = "";
            if (regionStates.troubled.length > 0) {
                allApisOK = false;
                retStr += ":warning:" + this.joinArray(regionStates.troubled) + "\n";
            }
            if (regionStates.down.length > 0) {
                allApisOK = false;
                retStr += ":x:" + this.joinArray(regionStates.down) + "\n";
            }
            if (regionStates.up.length > 0) {
                allApisIssues = false;
            }
            apiIssuesCounter += regionStates.troubled.length + regionStates.down.length;
            apiCounter += regionStates.troubled.length + regionStates.down.length + regionStates.up.length;

            // API on fire, if all regions for one api have issues
            if (regionStates.troubled.length + regionStates.down.length == regionCounter) {
                onFire = true;
            }

            // only add api if it has issues
            if (regionStates.troubled.length + regionStates.down.length > 0)
                statusEmbed.api[api] = retStr;
        }

        statusEmbed["onFire"] = onFire || (apiIssuesCounter / apiCounter) > this.sharedSettings.apiStatus.apiOnFireThreshold;
        statusEmbed["allApisOK"] = allApisOK;
        statusEmbed["allApisIssues"] = allApisIssues;
        return statusEmbed;
    }

    private joinArray(arr: Array<string>): string {
        let retStr = ''
        let i = 0;
        for (let j = 0; j < arr.length; j++) {
            let a = arr[j]
            retStr += a + (j < arr.length - 1 ? ', ' : '')
    
            if (i % 4 == 3) {
                retStr += '\n'
            }
            i++
        }

        // pad to minimum length
        while(retStr.length < 'BR, EUNE, EUW, JP,'.length) {
            retStr += " "
        }
        return retStr
    }
    
    private pickRandomOnFireImage(): string {
        // get rand in [0, number of on fire images - 1]
        const rand = Math.floor(Math.random() * this.sharedSettings.apiStatus.onFireImages.length);
        return this.sharedSettings.apiStatus.onFireImages[rand];
    }

    private startsWithAlias(msgContent: string): boolean {
        for (let alias of this.sharedSettings.apiStatus.aliases) {
            console.log("alias " + alias);
            if (msgContent.startsWith("!" + alias)) {
                return true;
            }
        }
        return false;
    }

    private isApiStatusCommand(content: string): boolean {
        return content.startsWith("!" + this.command) || this.startsWithAlias(content);
    }
}
