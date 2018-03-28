import { CommandHandler } from "./CommandController";
import { PersonalSettings } from "./PersonalSettings";
import { SharedSettings } from "./SharedSettings";

import Discord = require("discord.js");
import fetch from "node-fetch";

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
interface GithubAPILibraryStruct {
    stargazers_count: number;
}

interface APILibraryLink {
    name: string;
    url: string;
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

interface LibraryDescription {
    valid: boolean;
    stars: number;
    library: APILibraryStruct | null;
    links: string[];
}

export default class RiotAPILibraries implements CommandHandler {
    private settings: SharedSettings;

    private lastCall: number;

    private fetchSettings: object;

    constructor(personalSettings: PersonalSettings, settings: SharedSettings) {
        this.settings = settings;
        this.fetchSettings = {
            headers: {
                "Accept": "application/json",
                "Authorization": `Basic ${Buffer.from(personalSettings.github.username + ":" + personalSettings.github.password).toString("base64")}`,
                "Content-Type": "application/json",
            },
        };
    }

    public onReady(bot: Discord.Client) {
        console.log("Github extension loaded.");
    }

    public onCommand(message: Discord.Message, isAdmin: boolean, command: string, args: string[]) {

        if (args.length === 0) {
            return this.getList(message);
        }

        if (args.length > 1) {
            return message.channel.send(`unknown argument for command; ${args}`);
        }

        const param = args[0];

        if (param === "list") {
            return this.getList(message);
        }

        return this.getListForLanguage(message, param);
    }

    private async describeAPILibrary(json: GithubAPIStruct): Promise<LibraryDescription> {

        const libraryResponse = await fetch(json.download_url);
        const libraryInfo: APILibraryStruct = await libraryResponse.json();

        if (!libraryInfo.tags || libraryInfo.tags.indexOf("v3") === -1) {
            return { stars: 0, valid: false, library: null, links: [] };
        }

        const repoResponsePromise = fetch(`https://api.github.com/repos/${libraryInfo.owner}/${libraryInfo.repo}`, this.fetchSettings);

        // Make a list of the links
        const githubLink = `github.com/${libraryInfo.owner}/${libraryInfo.repo}`;
        let links = libraryInfo.links ? libraryInfo.links.map(link => `[${link.name}](${link.url})`) : []; // Can be empty array or null, sigh
        if (links.length === 0 || links.some(l => l.indexOf(githubLink) !== 0)) {
            // Make sure there is at least the github link
            links = [`[Github](https://${githubLink})`].concat(links);
        }

        const repoResponse = await repoResponsePromise;
        const repoInfo: GithubAPILibraryStruct = await repoResponse.json();

        return {
            library: libraryInfo,
            links,
            stars: repoInfo.stargazers_count,
            valid: true,
        };
    }

    private async getList(message: Discord.Message) {
        const response = await fetch(this.settings.riotApiLibraries.baseURL, this.fetchSettings);
        const data = await response.json() as GithubAPIStruct[];

        const languages = "`" + data.map(x => x.name).join(", ") + "`";
        const reply = this.settings.riotApiLibraries.languageList.replace("{languages}", languages);
        message.channel.send(reply);
    }

    private async getListForLanguage(message: Discord.Message, language: string) {
        const response = await fetch(this.settings.riotApiLibraries.baseURL + language);
        if (response.status !== 200) {
            message.channel.send(this.settings.riotApiLibraries.githubError + response.status);
            return;
        }

        const libraryList = await response.json();
        if (!Array.isArray(libraryList) || libraryList.length === 0 || !libraryList[0].sha) {
            message.channel.send(this.settings.riotApiLibraries.noLanguage + language);
            return;
        }

        const editMessagePromise = message.channel.send(`Found the list of libraries for ${language}, listing ${libraryList.length} libraries, this post will be edited with the result.`);

        const promises = libraryList.map(lib => this.describeAPILibrary(lib));
        const libraryDescriptions = (await Promise.all(promises))
            .filter(l => l.valid && l.library) // Only valid ones
            .sort((a, b) => b.stars - a.stars); // Sort by stars

        const embed = new Discord.RichEmbed({ title: `List of libraries for ${language}:` });
        for (const desc of libraryDescriptions) {
            if (!desc.library) {
                // https://github.com/Microsoft/TypeScript/issues/18562
                continue;
            }
            embed.addField(`${desc.library.repo} (★ ${desc.stars ? desc.stars : "0"})`, `${desc.library.description ? desc.library.description + "\n" : " "}${desc.links.join(", ")}`);
        }

        let editMessage = await editMessagePromise;
        if (Array.isArray(editMessage)) { editMessage = editMessage[0]; }
        editMessage.edit({ embed });
    }
}
