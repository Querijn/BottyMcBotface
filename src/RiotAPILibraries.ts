import { SharedSettings } from "./SharedSettings";
import fetch from "node-fetch";

import Discord = require("discord.js");


interface LinkStruct {
    self: string;
    git: string;
    html: string;
}

interface GithubAPIStruct {
    name: string;
    path: string;
    sha: string;
    size: number;
    url: string;
    html_url: string;
    git_url: string;
    download_url: string;
    type: string;
    _links: LinkStruct;
}

interface APILibraryLink {
    name: string,
    url: string,
}

interface APILibraryStruct {
    owner: string;
    repo: string;
    language: string;
    description: string;
    links: APILibraryLink[];
    metadata: any;
    tags: string[];
}

export default class RiotAPILibraries {
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

    /**
     * libraries not tagged with v3 are out of date, so we filter them out
     * 
     * @param object the response from the url
     */
    isValidLibrary(object: any): object is APILibraryStruct {
        return (<APILibraryStruct>object).tags.some(x => x === "v3");
    }

    /**
     * github api returns an array of files in the directory, or an error object if the path doesnt exist
     * 
     * @param object the response from the url
     */
    isValidResponse(object: any): object is GithubAPIStruct[] {
        return (<GithubAPIStruct[]>object)[0].sha in object;
    }

    async onCommand(message: Discord.Message) {

        const args = message.content.split(" ");

        // if it's just our command, get the list
        if (args.length < 2) {
            args.push("list");
        }

        const [command, language] = args;

        if (this.settings.githubLibraries.aliases.some(x => x === command)) {

            if (language === "list") {
                const response = await fetch(this.settings.githubLibraries.baseURL);
                const data = await response.json() as GithubAPIStruct[];

                let languages = data.map(x => x.name).join(",");
                let reply = this.settings.githubLibraries.languageList;
                message.channel.send(reply.replace("{languages}", languages));
                return;
            }

            const response = await fetch(this.settings.githubLibraries.baseURL + language);
            const data = await response.json();

            if (!this.isValidResponse(data)) {
                message.reply(this.settings.githubLibraries.noLanguage + language);
                return;
            }

            let printMe = "";
            for (const lib of data) {
                printMe += await this.readJsonData(lib);
            }

            const embed = new Discord.RichEmbed().addField("`List of libraries for ${language}:`", printMe);
            message.reply({ embed });
        }
    }

    async readJsonData(json: GithubAPIStruct): Promise<string> {
        const response = await fetch(json.download_url);
        const data = await response.json();

        if (!this.isValidLibrary(data)) {
            return "";
        }

        return `[${data.repo} by ${data.owner}](https://github.com/${data.owner}/${data.repo})\n`;
    }
}
