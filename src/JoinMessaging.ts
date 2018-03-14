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
}
