import Discord = require("discord.js");
import fetch from "node-fetch";

import { fileBackedObject } from "./FileBackedObject";
import { SharedSettings } from "./SharedSettings";

export interface VersionCheckerData {
    latestGameVersion: string;
    latestDataDragonVersion: string;
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
            const currentVersionArray = this.data.latestGameVersion.split(".");
            let nextMajor: number = parseInt(currentVersionArray[0], 10);
            let nextMinor: number = parseInt(currentVersionArray[1], 10);

            let tries = 0;

            let patchNotes: string;

            let lastNewValidMajor = nextMajor;
            let lastNewValidMinor = nextMinor;
            let validPatchNotes: string = "invalid";
            let newPatch = false;

            do {
                nextMinor++;
                patchNotes = `https://www.leagueoflegends.com/en-us/news/game-updates/patch-${nextMajor.toString()}-${nextMinor.toString()}-notes/`;
                tries++;

                let response = await fetch(patchNotes, {
                    method: "GET",
                });

                if (response.ok) {
                    lastNewValidMajor = nextMajor;
                    lastNewValidMinor = nextMinor;
                    validPatchNotes = patchNotes;
                    newPatch = true;
                }
                else { // check for change in season
                    nextMajor++;
                    nextMinor = 1;

                    patchNotes = `https://www.leagueoflegends.com/en-us/news/game-updates/patch-${nextMajor.toString()}-${nextMinor.toString()}-notes/`;
                    tries++;

                    response = await fetch(patchNotes, {
                        method: "GET",
                    });

                    if (response.ok) {
                        lastNewValidMajor = nextMajor;
                        lastNewValidMinor = nextMinor;
                        validPatchNotes = patchNotes;
                        newPatch = true;
                    }
                    else {
                        break;
                    }
                }
            }
            while (tries < 100);

            if (newPatch === false) return; // no new version

            this.data.latestGameVersion = `${lastNewValidMajor.toString()}.${lastNewValidMinor.toString()}`;

            const embed = new Discord.EmbedBuilder()
                .setColor(0xf442e5)
                .setTitle("New League of Legends version!")
                .setDescription(`Version ${this.data.latestGameVersion} of League of Legends has posted its patch notes. You can expect the game to update soon.\n\nYou can find the notes here:\n${validPatchNotes}`)
                .setURL(validPatchNotes)
                .setThumbnail(this.sharedSettings.versionChecker.gameThumbnail);

            this.channel.send({ embeds: [embed] });
        } catch (e) {
            console.error("Game version fetch error: " + e.message);
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
