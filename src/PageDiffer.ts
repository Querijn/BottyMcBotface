import { fileBackedObject } from "./FileBackedObject";
import { SharedSettings, PageType, PageDifferPage } from "./SharedSettings";
import { clearTimeout, setTimeout } from "timers";

import Discord = require("discord.js");
import crc32 = require("crc-32");
import fs = require("fs");
import fetch from "node-fetch";
import h2p = require("html2plaintext");

interface PageDifferData {
    hashes: { [page: string]: number };
}

/**
 * Checks differences in pages
 *
 * @export
 * @class PageDiffer
 */
export default class PageDiffer {
    private bot: Discord.Client;
    private channel: Discord.TextChannel;
    private sharedSettings: SharedSettings;
    private data: PageDifferData;
    private timeOut: NodeJS.Timer | null;

    constructor(bot: Discord.Client, sharedSettings: SharedSettings, pageDiffFile: string) {
        console.log("Requested PageDiffer extension..");
        this.bot = bot;

        this.sharedSettings = sharedSettings;
        this.data = fileBackedObject(pageDiffFile);

        this.bot.on("ready", this.onBot.bind(this));
    }

    public async onBot() {
        const guild = this.bot.guilds.get(this.sharedSettings.server);
        if (!guild) {
            console.error(`PageDiffer: Unable to find server with ID: ${this.sharedSettings.server}`);
            return;
        }

        const channel = guild.channels.find("name", this.sharedSettings.pageDiffer.channel);
        if (!channel || !(channel instanceof Discord.TextChannel)) {
            console.error(`PageDiffer: Unable to find channel: ${this.sharedSettings.pageDiffer.channel}`);
            return;
        }

        this.channel = channel as Discord.TextChannel;
        console.log("PageDiffer extension loaded.");

        this.checkPages();
    }

    private getFetchUrl(page: PageDifferPage) {

        switch (page.type) {
            case PageType.Article:
                return this.sharedSettings.pageDiffer.articleHost.replace(/{id}/g, page.ident); // In the case of an article, page.ident is an ID number

            case PageType.Page:
                return page.ident; // In the case of a page, page.ident is the URL.

            default:
                throw new Error("getFetchUrl was given an undefined page type");
        }
    }

    private async checkPages() {

        for (const page of this.sharedSettings.pageDiffer.pages) {

            const fetchUrl = this.getFetchUrl(page);

            const resp = await fetch(fetchUrl);
            if (resp.status !== 200) {
                console.warn(`PageDiffer got an unusual HTTP status code checking for ${page.type} "${page.name}". "${fetchUrl}" returns ${resp.status}.`);
                continue;
            }

            let body = "";
            let pageLocation = page.ident;
            switch (page.type) {
                case PageType.Article: {
                    const article = (await resp.json()).article;
                    pageLocation = article.html_url;
                    body = article.body;
                    break;
                }

                case PageType.Page: {
                    body = await resp.text();
                    break;
                }
            }

            const diffBody = h2p(body);
            const hash = crc32.str(diffBody);
            if (this.data.hashes[page.type + page.ident] === hash) continue;

            // Make sure the folders are there
            if (!fs.existsSync("www")) fs.mkdirSync("www");
            if (!fs.existsSync("www/pages")) fs.mkdirSync("www/pages");

            const cleanName = page.name.toLowerCase().replace(/[\W_]+/g, "-");
            const folderName = "pages/" + cleanName + "/";
            const hasDiff = fs.existsSync("www/" + folderName);
            if (!hasDiff) fs.mkdirSync("www/" + folderName);

            // Save the file and the info about the file
            const curTime = Date.now();
            fs.writeFileSync("www/" + folderName + curTime + "_info.json", JSON.stringify(page));
            fs.writeFileSync("www/" + folderName + curTime + ".html", body);
            fs.writeFileSync("www/" + folderName + "index.json", JSON.stringify(fs.readdirSync("www/" + folderName).filter(f => f.endsWith(".html")).map(f => f.replace(/.html/g, ""))));
            this.data.hashes[page.type + page.ident] = hash;

            // Get to the posting part, if we have a difference
            if (!hasDiff) continue;

            const embed = new Discord.RichEmbed()
                .setColor(0xffca95)
                .setTitle(`The ${page.type} "${page.name}" has changed`)
                .setDescription(`Something has changed on "${page.name}".\n\nYou can see the current version here: ${pageLocation}\n\nYou can check out the difference here: ${this.sharedSettings.botty.webServer.relativeLiveLocation + folderName}`)
                .setURL(this.sharedSettings.botty.webServer.relativeLiveLocation + folderName)
                .setThumbnail(this.sharedSettings.pageDiffer.embedImageUrl);

            this.channel.send({ embed });
        }

        if (this.timeOut !== null) clearTimeout(this.timeOut);
        this.timeOut = setTimeout(this.checkPages.bind(this), this.sharedSettings.pageDiffer.checkInterval);
    }
}
