import Discord = require("discord.js");
import fs = require("fs");

import { fileBackedObject } from "./FileBackedObject";
import { SharedSettings } from "./SharedSettings";
import { GuildMember } from "discord.js";
import CommandController from "./CommandController";

export default class JoinMessaging {
    private bot: Discord.Client;
    private sharedSettings: SharedSettings;
    private messageContents: string;
    private commandController: CommandController;

    constructor(bot: Discord.Client, sharedSettings: SharedSettings, commandController: CommandController) {
        console.log("Requested join message extension..");

        this.sharedSettings = sharedSettings;
        console.log("Successfully loaded join message settings.");

        this.commandController = commandController;

        this.bot = bot;
        this.bot.on("ready", this.onBot.bind(this));
        this.bot.on("message", this.onMessage.bind(this));
    }

    onBot() {

        try {
            this.messageContents = fs.readFileSync(this.sharedSettings.onJoin.messageFile, "utf8").toString();
            this.messageContents += this.commandController.getHelp();

            this.bot.on("guildMemberAdd", function(user: GuildMember) {
                user.send(this.messageContents);
            }.bind(this));

            console.log("Join message extension loaded.");
        }
        catch (e) {
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
