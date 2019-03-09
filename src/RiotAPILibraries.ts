import { SharedSettings } from "./SharedSettings";

import Discord = require("discord.js");
import fetch from "node-fetch";

import { clearTimeout, setTimeout } from "timers";

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

export default class RiotAPILibraries {
    private settings: SharedSettings;

    private lastCall: number;

    private fetchSettings: object;
    private languageList: string[] = [];
    private timeOut: NodeJS.Timer | null;

    constructor(settings: SharedSettings) {
        const personalSettings = settings.botty;
        this.settings = settings;
        this.fetchSettings = {
            headers: {
                "Accept": "application/json",
                "Authorization": `Basic ${Buffer.from(personalSettings.github.username + ":" + personalSettings.github.password).toString("base64")}`,
                "Content-Type": "application/json",
            },
        };

        this.initList();
    }

    public onLibs(message: Discord.Message, isAdmin: boolean, command: string, args: string[]) {

        if (args.length === 0) {
            return this.getList(message);
        }

        if (args.length > 1) {
            return message.channel.send(`unknown argument for command; ${args}`);
        }

        const param = args[0].toLowerCase();

        if (param === "list") {
            return this.getList(message);
        }

        return this.getListForLanguage(message, param);
    }

    private async describeAPILibrary(json: GithubAPIStruct): Promise<LibraryDescription> {

        const libraryResponse = await fetch(json.download_url);
        const libraryInfo: APILibraryStruct = await libraryResponse.json();

        if (!libraryInfo.tags || libraryInfo.tags.indexOf("v4") === -1) {
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

    private async initList() {
        
        const response = await fetch(this.settings.riotApiLibraries.baseURL, this.fetchSettings);
        if (response.status !== 200) {
            console.error(this.settings.riotApiLibraries.githubErrorList + response.status);
            return;
        }

        const languageNames = (await response.json() as GithubAPIStruct[]).map(x => x.name);

        this.languageList = [];
        for (const language of languageNames) {
            const libraries = await this.getLibrariesForLanguage(language);
            if (libraries.length == 0) continue;
            this.languageList.push(language);
        }

        console.log("Riot API library languages updated: " + this.languageList.join(", "));
        if (this.timeOut) {
            clearTimeout(this.timeOut);
            this.timeOut = null;
        }
        this.timeOut = setTimeout(this.initList.bind(this), this.settings.riotApiLibraries.checkInterval);
    }

    private async getList(message: Discord.Message) {
        const reply = this.settings.riotApiLibraries.languageList.replace("{languages}", "`" + this.languageList.join(", ") + "`");
        message.channel.send(reply);
    }

    private async getLibrariesForLanguage(language: string): Promise<LibraryDescription[]> {
        const response = await fetch(this.settings.riotApiLibraries.baseURL + language);
        switch (response.status) {
            case 200: {
                // continue
                break;
            }
            case 404: {
                throw new Error(`I found no libraries for ${language}.`);
            }
            default: {
                throw new Error(this.settings.riotApiLibraries.githubErrorLanguage + response.status);
            }
        }

        const libraryList = await response.json();
        if (!Array.isArray(libraryList) || libraryList.length === 0 || !libraryList[0].sha) {
            throw new Error(this.settings.riotApiLibraries.noLanguage + language);
        }
        const promises = libraryList.map(lib => this.describeAPILibrary(lib));
        const libraryDescriptions = (await Promise.all(promises))
            .filter(l => l.valid && l.library) // Only valid ones

        return libraryDescriptions;
    }

    private async getListForLanguage(message: Discord.Message, language: string): Promise<void> {

        // Check if alias
        for (const [key, values] of Object.entries(this.settings.riotApiLibraries.aliases)) {
            if (values.find(self => self.toLowerCase() === language.toLowerCase())) {
                return this.getListForLanguage(message, key);
            }
        }

        const editMessagePromise = message.channel.send(`Fetching the list of libraries for ${language}, this post will be edited with the result.`);

        let libraryDescriptions: LibraryDescription[] = [];
        try {
            libraryDescriptions = (await this.getLibrariesForLanguage(language))
            .sort((a, b) => b.stars - a.stars); // Sort by stars
        }
        catch (e) {
            message.channel.send(e);
            return;
        }

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

        if (libraryDescriptions.length === 0) {
            editMessage.edit(`No up-to-date libraries found for ${language}`);
            return;
        }

        editMessage.edit({ embed });
    }
}
