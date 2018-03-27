import Discord = require("discord.js");
import fs = require("fs");

import { GuildMember } from "discord.js";
import { fileBackedObject } from "./FileBackedObject";
import { SharedSettings } from "./SharedSettings";

export default class JoinMessaging {
    private bot: Discord.Client;
    private sharedSettings: SharedSettings;
    private messageContents: string;

    constructor(bot: Discord.Client, sharedSettings: SharedSettings) {
        console.log("Requested join message extension..");

        this.sharedSettings = sharedSettings;
        console.log("Successfully loaded join message settings.");

        this.bot = bot;
        this.bot.on("ready", this.onBot.bind(this));
        this.bot.on("message", this.onMessage.bind(this));
    }

    private onBot() {
        try {
            this.messageContents = fs.readFileSync(this.sharedSettings.onJoin.messageFile, "utf8").toString();
            this.bot.on("guildMemberAdd", user => user.send(this.messageContents));
            console.log("Join message extension loaded.");
        } catch (e) {
            console.error("Something went wrong loading the message for new users: " + e.toString());
        }
    }

    private onMessage(message: Discord.Message) {
        if (message.author.bot) return;
        const split = message.cleanContent.split(/[\n\r\s]/);
        const prefix = split[0][0];
        const command = split[0].substr(1);

        if (prefix !== "!") return;
        if ("welcome" !== command) return;

        if (message.mentions.members === null) {
            message.author.send(this.messageContents);
            return;
        }

        message.mentions.members.forEach(u => u.send(this.messageContents));
    }
}
