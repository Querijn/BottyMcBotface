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

interface LibraryDescription
{
    valid: boolean,
    stars: number,
    description: string
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

    async onCommand(message: Discord.Message) {

        const args = message.content.split(" ");

        // if it's just our command, get the list
        if (args.length < 2) {
            args.push("list");
        }

        const [command, language] = args;

        // if !libs, !libraries, etc
        if (this.settings.githubLibraries.aliases.some(x => x === command)) {

            if (language === "list") {
                const response = await fetch(this.settings.githubLibraries.baseURL);
                const data = await response.json() as GithubAPIStruct[];

                let languages = "`" + data.map(x => x.name).join(", ") + "`";
                let reply = this.settings.githubLibraries.languageList.replace("{languages}", languages);
                message.channel.send(reply);
                return;
            }

            const response = await fetch(this.settings.githubLibraries.baseURL + language);
            if (response.status != 200) {
                message.channel.send(this.settings.githubLibraries.githubError + response.status);
                return;
            }
            
            const libraryList = await response.json();
            if (!Array.isArray(libraryList) || libraryList.length === 0 || !libraryList[0].sha) {
                message.channel.send(this.settings.githubLibraries.noLanguage + language);
                return;
            }

            let editMessagePromise = message.channel.send(`Found the list of libraries for ${language}, listing ${libraryList.length} libraries, this post will be edited with the result.`);

            let promises: Promise<LibraryDescription>[] = [];
            for (const library of libraryList) {
                promises.push(this.describeAPILibrary(library));
            }

            const libraryDescriptions = (await Promise.all(promises))
            .filter(l => l.valid) // Only valid ones
            .sort((a, b) => b.stars - a.stars) // Sort by stars
            .map(d => d ? d.description : ""); // Take description
        
            let messages = [""];
            for (const desc of libraryDescriptions) {
                if (messages[messages.length - 1].length + desc.length > 1024) {
                    messages.push(desc + '\n');
                    continue;
                }

                messages[messages.length - 1] += desc;
            }

            const embed = new Discord.RichEmbed();
            for (let i = 0; i < messages.length; i++) 
                embed.addField(i == 0 ? `List of libraries for ${language}:` : "📚 (List too long, continues below)", messages[i]);

            let editMessage = await editMessagePromise; 
            if (Array.isArray(editMessage)) editMessage = editMessage[0];
            editMessage.edit({ embed });
        }
    }

    async describeAPILibrary(json: GithubAPIStruct): Promise<LibraryDescription> {

        return new Promise<LibraryDescription>(async(resolve, reject) => {
            const libraryResponse = await fetch(json.download_url);
            const libraryInfo: APILibraryStruct = await libraryResponse.json();
    
            if (!libraryInfo.tags || libraryInfo.tags.indexOf("v3") === -1) {
                resolve({ stars: 0, valid: false, description: "" });
            }
            
            const repoResponsePromise = fetch(`https://api.github.com/repos/${libraryInfo.owner}/${libraryInfo.repo}`);

            // Make a list of the links
            let githubLink = `https://github.com/${libraryInfo.owner}/${libraryInfo.repo}`;
            let links = libraryInfo.links ? libraryInfo.links.map(link => `[${link.name}](${link.url})`) : []; // Can be empty array or null, sigh
            if (links.length == 0 || links.some(l => l.indexOf(githubLink) != 0)) // Make sure there is at least the github link
                links = [`[Github](${githubLink})`].concat(links);

            const repoResponse = await repoResponsePromise;
            const repoInfo = await repoResponse.json();

            resolve({
                valid: true,
                stars: repoInfo.stargazers_count,
                description: `${libraryInfo.repo} by ${libraryInfo.owner} (⭐ ${repoInfo.stargazers_count}): ${links.join(", ")}\n`
            });
        });        
    }
}
