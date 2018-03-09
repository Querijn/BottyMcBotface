import { SharedSettings } from "./SharedSettings";
import fetch from "node-fetch";

import Discord = require("discord.js");

export default class GithubLibraries {
    private bot: Discord.Client;
    private settings: SharedSettings;

    constructor(bot: Discord.Client, settings: SharedSettings) {
        console.log("Requested Github extension..");
        this.bot = bot;
        this.settings = settings;

        this.bot.on("ready", this.onBot.bind(this));
        this.bot.on("message", this.onCommand.bind(this));
    }

    onBot() {
        console.log("Github extension loaded.");
    }

    onCommand(message: Discord.Message) {

        const args = message.content.split(" ");

        if (args.length !== 2) {
            return;
        }

        const [command, language] = args;

        if (this.settings.githubLibraries.aliases.some(x => x === command.substr(1))) {

            const response = fetch(this.settings.githubLibraries.baseURL + language);
            const data = response.json();

            // github api returns an array of files in the directory, or an error object if the path doesnt exist
            if (!Array.isArray(data)) {
                message.reply(this.settings.githubLibraries.noLanguage + language);
                return;
            }

            var printMe = `List of languages for ${language}:\n`;
            data.map(x => this.readJsonData).forEach(x => printMe += x);

            message.reply(printMe);
        }
    }

    readJsonData(json: any): string {
        const response = fetch(json.download_url);
        const data = response.json();

        // do not return libraries that are uncompatible with v3
        if (!json.tags.some((x: string) => x === "v3")) {
            return "";
        }

        return `${json.repo} by ${json.owner}\n`;
    }
}
