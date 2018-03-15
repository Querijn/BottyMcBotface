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
    private bot: Discord.Client;
    private settings: SharedSettings;

    private lastCall: number;

    private fetchSettings: object;

    constructor(bot: Discord.Client, personalSettings: PersonalSettings, settings: SharedSettings) {
        console.log("Requested Github extension..");
        this.bot = bot;
        this.settings = settings;

        this.bot.on("ready", this.onBot.bind(this));
        this.bot.on("message", this.onCommand.bind(this));

        this.fetchSettings = {
            headers: {
                "Accept": "application/json",
                "Authorization": `Basic ${Buffer.from(personalSettings.github.username + ":" + personalSettings.github.password).toString("base64")}`,
                "Content-Type": "application/json",
            },
        };
    }

    private onBot() {
        console.log("Github extension loaded.");
    }

    private async onCommand(message: Discord.Message) {

        const args = message.content.split(" ");

        const [command, language = "list"] = args;

        // if !libs, !libraries, etc
        if (this.settings.githubLibraries.aliases.some(x => x === command)) {

            if (language === "list") {
                const responses = await fetch(this.settings.githubLibraries.baseURL, this.fetchSettings);
                const data = await responses.json() as GithubAPIStruct[];

                const languages = "`" + data.map(x => x.name).join(", ") + "`";
                const reply = this.settings.githubLibraries.languageList.replace("{languages}", languages);
                message.channel.send(reply);
                return;
            }

            const response = await fetch(this.settings.githubLibraries.baseURL + language);
            if (response.status !== 200) {
                message.channel.send(this.settings.githubLibraries.githubError + response.status);
                return;
            }

            const libraryList = await response.json();
            if (!Array.isArray(libraryList) || libraryList.length === 0 || !libraryList[0].sha) {
                message.channel.send(this.settings.githubLibraries.noLanguage + language);
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
        const repoInfo = await repoResponse.json();

        return {
            library: libraryInfo,
            links,
            stars: repoInfo.stars,
            valid: true,
        };
    }
}
