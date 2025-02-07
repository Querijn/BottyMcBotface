import Discord = require("discord.js");
import fetch from "node-fetch";
import cheerio = require("cheerio");

import { fileBackedObject } from "./FileBackedObject";
import { SharedSettings } from "./SharedSettings";

export interface VersionCheckerData {
    latestGameVersion: string;
    latestDataDragonVersion: string;
}
interface BladeItem {
    title: string;
    publishedAt: string;
    action: {
        type: string;
        payload: {
            url: string;
        }
    }
}
export default class VersionChecker {
    private bot: Discord.Client;
    private sharedSettings: SharedSettings;
    private data: VersionCheckerData;
    private channel: Discord.TextChannel;

    constructor(bot: Discord.Client, sharedSettings: SharedSettings, dataFile: string) {
        console.log("Requested VersionChecker extension..");

        this.sharedSettings = sharedSettings;
        console.log("Successfully loaded VersionChecker settings.");

        this.data = fileBackedObject(dataFile, "www/" + dataFile);
        console.log("Successfully loaded VersionChecker data file.");

        this.bot = bot;
        this.bot.on("ready", this.onBot.bind(this));
    }

    private async onBot() {
        const guild = this.bot.guilds.cache.get(this.sharedSettings.server.guildId);
        if (!guild) {
            console.error(`VersionChecker: Unable to find server with ID: ${this.sharedSettings.server}`);
            return;
        }

        let channel = guild.channels.cache.find(c => c.name === this.sharedSettings.forum.channel);
        if (!channel || !(channel instanceof Discord.TextChannel)) {
            if (this.sharedSettings.botty.isProduction) {
                console.error(`VersionChecker: Unable to find external activity channel!`);
                return;
            }
            else {
                channel = await guild!.channels.create({name: this.sharedSettings.forum.channel, type: Discord.ChannelType.GuildText });
            }
        }

        this.channel = channel as Discord.TextChannel;
        console.log("VersionChecker extension loaded.");
        this.onUpdate();
    }

    private async updateDataDragonVersion() {
        try {
            const response = await fetch(`http://ddragon.leagueoflegends.com/api/versions.json`, {
                method: "GET",
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
            });

            if (response.status !== 200) console.log("HTTP Error trying to read ddragon version: " + response.status);

            const dataDragonVersion = await response.json();

            if (dataDragonVersion[0] === this.data.latestDataDragonVersion) {
                return;
            }

            // new version
            // TODO: Maybe check for higher version, denote type of update? (patch/etc)
            this.data.latestDataDragonVersion = dataDragonVersion[0];
            const downloadLink = `http://ddragon.leagueoflegends.com/cdn/dragontail-${this.data.latestDataDragonVersion}.tgz`;

            const embed = new Discord.EmbedBuilder()
                .setColor(0x42f456)
                .setTitle("New DDragon version!")
                .setDescription(`Version ${this.data.latestDataDragonVersion} of DDragon has hit the CDN.\nThe download is available here:\n${downloadLink}`)
                .setThumbnail(this.sharedSettings.versionChecker.dataDragonThumbnail);

            this.channel.send({ embeds: [embed] });
        } catch (e) {
            console.error("Ddragon fetch error: " + e.message);
        }
    }

    private async updateGameVersion() {
        try {
            let latestNotesItem: BladeItem;
            let lastPostedPatchNotesItem: BladeItem | undefined;
            let lastPostedPatchNotes = this.data.latestGameVersion;
            let lastPostedPatchNotesDate: Date = new Date(NaN);
            let patchNotes: BladeItem[] = [];
            const gameUpdatesPage = await fetch("https://www.leagueoflegends.com/en-us/news/game-updates/",  {
                method: "GET"
            });
            const gameUpdatesPageHtml = cheerio.load(await gameUpdatesPage.text());
            let gameUpdatesPageJson = gameUpdatesPageHtml("#__NEXT_DATA__").html();

            if (!gameUpdatesPage.ok) {
                throw new Error(`Got status code ${gameUpdatesPage.status} while trying to get the game updates page`)
            }
            else if (!gameUpdatesPageJson) {
                throw new Error("Failed to find JSON on the LoL game updates page");
            }
            let json = JSON.parse(gameUpdatesPageJson);
            // Check if we have something that looks like the game updates page
            if (!json.props.pageProps.page.blades) {
                throw new Error("Got a JSON that doesn't seem to be the game updates page");
            }
            // Find which blade has the articles
            for (const blade of json.props.pageProps.page.blades) {
                if (blade.type == "articleCardGrid") {
                    patchNotes = blade.items.filter((bladeItem: BladeItem) => bladeItem.title.match(/^Patch ((20)?\d{2}\.S[1-3]\.\d{1,2}|\d{2}\.\d{1,2}) Notes$/i));
                    break;
                }
            }
            if (patchNotes && patchNotes.length > 0) {
                latestNotesItem = patchNotes.reduce((latest, current) => new Date(current.publishedAt) > new Date(latest.publishedAt) ? current : latest);
                lastPostedPatchNotesItem = patchNotes.find(bladeItem => bladeItem.title == `Patch ${lastPostedPatchNotes} Notes`);
                if (lastPostedPatchNotesItem) {
                    lastPostedPatchNotesDate = new Date(lastPostedPatchNotesItem.publishedAt);
                }
                // Maybe the patch note version is too old to still be on page?
                if (isNaN(lastPostedPatchNotesDate.getTime())) {
                    console.error(`Couldn't find publish date for Patch ${lastPostedPatchNotes}. Latest found title is ${latestNotesItem}, updating latestGameVersion but not making post`);
                    this.data.latestGameVersion = latestNotesItem.title.split(" ")[1];
                    return;
                }
                if (new Date(latestNotesItem.publishedAt) > lastPostedPatchNotesDate) {
                    this.data.latestGameVersion = latestNotesItem.title.split(" ")[1];
                    const embed = new Discord.EmbedBuilder()
                    .setColor(0xf442e5)
                    .setTitle("New League of Legends version!")
                    .setDescription(`Version ${this.data.latestGameVersion} of League of Legends has posted its patch notes. You can expect the game to update soon.\n\nYou can find the notes here:\nhttps://www.leagueoflegends.com${latestNotesItem.action.payload.url}`)
                    .setURL("https://www.leagueoflegends.com" + latestNotesItem.action.payload.url)
                    .setThumbnail(this.sharedSettings.versionChecker.gameThumbnail);
    
                this.channel.send({ embeds: [embed] });
                }
                
            }
            else {
                console.error("Failed to find/parse the JSON on the game update page");
            }
        }
        catch (e){
            console.error(e);
        }
    }

    private async onUpdate() {
        await this.updateDataDragonVersion();
        await this.updateGameVersion();

        setTimeout(this.onUpdate.bind(this), this.sharedSettings.versionChecker.checkInterval);
    }

    get ddragonVersion(): string {
        return this.data.latestDataDragonVersion;
    }

    get gameVersion(): string {
        return this.data.latestGameVersion;
    }
}
