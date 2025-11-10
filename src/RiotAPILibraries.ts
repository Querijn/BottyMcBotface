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
    description: string;
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
        let topics: string[] = ["v4"]; // Default tag applies to all channels that don't have specific tags and when no tags are specified in the command
        if ("name" in message.channel) {
            for (const [topic, tags] of Object.entries(this.settings.riotApiLibraries.channelTopics)) {
                if (message.channel.name.toLowerCase().includes(topic)) {
                    topics = tags
                    break;
                }
            }
        }

        if (args.length === 0) {
            return this.getList(message);
        }

        if (args.length > 1) {
            topics = args.slice(1).map(x => x.toLowerCase()); // Set the tags to the ones specified in the command
        }

        const param = args[0].toLowerCase();

        if (param === "list") {
            return this.getList(message);
        }

        return this.getListForLanguage(message, param, topics);
    }

    private async describeAPILibrary(json: GithubAPIStruct, tags: string[] = ["v4"]): Promise<LibraryDescription> {

        const libraryResponse = await fetch(json.download_url);
        const libraryInfo: APILibraryStruct = await libraryResponse.json();

        const hasAllTags = tags.every(tag => libraryInfo.tags?.includes(tag));
        if (!hasAllTags) {
            return { stars: 0, valid: false, library: null, links: [] };
        }

        const repoResponsePromise = fetch(`https://api.github.com/repos/${libraryInfo.owner}/${libraryInfo.repo}`, this.fetchSettings);

        // Make a list of the links
        const githubLink = `github.com/${libraryInfo.owner}/${libraryInfo.repo}`;
        let links = libraryInfo.links ? libraryInfo.links.map(link => `[${link.name}](${link.url})`) : []; // Can be empty array or null, sigh

        if (links.length === 0 || links.every(l => l.indexOf(githubLink) === -1)) {
            // Make sure there is at least the github link
            links = [`[Github](https://${githubLink})`].concat(links);
        }

        const repoResponse = await repoResponsePromise;
        const repoInfo: GithubAPILibraryStruct = await repoResponse.json();

        if(!libraryInfo.description){
            libraryInfo.description = repoInfo.description;
        }

        return {
            library: libraryInfo,
            links,
            stars: repoInfo.stargazers_count,
            valid: true,
        };
    }

    private async initList() {
        try {
            const response = await fetch(this.settings.riotApiLibraries.baseURL, this.fetchSettings);
            if (response.status !== 200) {
                console.error(this.settings.riotApiLibraries.githubErrorList + response.status);
                return;
            }

            const languageNames = (await response.json() as GithubAPIStruct[]).map(x => x.name);

            this.languageList = [];
            for (const language of languageNames) {
                try {
                    const libraries = await this.getLibrariesForLanguage(language);
                    if (libraries.length === 0) continue;
                    this.languageList.push(language);
                }
                catch (e) {
                    console.warn(`Unable to fetch library data for language ${language}: ${e}`);
                }
            }

            console.log("Riot API library languages updated: " + this.languageList.join(", "));
        }
        catch (e) {
            console.warn(`Unable to fetch all library data: ${e}`);
        }

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

    private async getLibrariesForLanguage(language: string, tags: string[] = ["v4"]): Promise<LibraryDescription[]> {
        const response = await fetch(this.settings.riotApiLibraries.baseURL + language, this.fetchSettings);
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
        const promises = libraryList.map(lib => this.describeAPILibrary(lib, tags));
        const libraryDescriptions = (await Promise.all(promises))
            .filter(l => l.valid && l.library); // Only valid ones

        return libraryDescriptions;
    }

    private getLanguageColor(language: string): number {
        const languageColors: { [key: string]: number } = {
            "javascript": 0XF1E05A,
            "typescript": 0X2B7489,
            "python": 0X3572A5,
            "c-sharp": 0X178600,
            "cpp": 0XF34B7D,
            "c": 0X555555,
            "java": 0XB07219,
            "php": 0X777BB4,
            "ruby": 0x701516,
            "go": 0x00ADD8,
            "rust": 0XDEA584,
            "swift": 0XF05139,
        };

        const normalizedLanguage = language.toLowerCase();
        return languageColors[normalizedLanguage] || 0x242429;
    }

    private async getListForLanguage(message: Discord.Message, language: string, tags: string[] = ["v4"]): Promise<void> {

        // Check if alias
        for (const [key, values] of Object.entries(this.settings.riotApiLibraries.aliases)) {
            if (values.find(self => self.toLowerCase() === language)) {
                return this.getListForLanguage(message, key, tags);
            }
        }

        const editMessagePromise = message.channel.send(`Fetching the list of libraries for ${language}, this post will be edited with the result.`);

        let libraryDescriptions: LibraryDescription[] = [];
        try {
            libraryDescriptions = (await this.getLibrariesForLanguage(language, tags))
                .sort((a, b) => b.stars - a.stars); // Sort by stars
        }
        catch (e) {
            message.channel.send(e.message);
            return;
        }

        const embed = new Discord.EmbedBuilder({ title: `List of libraries for ${language}:` })
            .setColor(this.getLanguageColor(language));
        for (const desc of libraryDescriptions) {
            if (!desc.library) {
                // https://github.com/Microsoft/TypeScript/issues/18562
                continue;
            }
            embed.addFields([{
                name: `${desc.library.repo} (★ ${desc.stars ? desc.stars : "0"})`,
                value: `${desc.library.description ? desc.library.description + "\n" : " "}${desc.links.join(", ")}`
            }]);
        }

        let editMessage = await editMessagePromise;
        if (Array.isArray(editMessage)) { editMessage = editMessage[0]; }

        if (libraryDescriptions.length === 0) {
            editMessage.edit(`No up-to-date libraries found for ${language} tagged with \`${tags.join("\`, \`")}\``);
            return;
        }

        editMessage.edit({ embeds: [embed] });
    }
}
