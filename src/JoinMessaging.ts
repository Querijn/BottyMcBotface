import Discord = require("discord.js");
import fs = require("fs");

import CommandController from "./CommandController";

import { GuildMember } from "discord.js";
import { fileBackedObject } from "./FileBackedObject";
import { SharedSettings } from "./SharedSettings";

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
    }

    private onBot() {
        try {
            this.messageContents = fs.readFileSync(this.sharedSettings.onJoin.messageFile, "utf8").toString();
            this.messageContents += this.commandController.getHelp();

            this.bot.on("guildMemberAdd", (user: GuildMember) => user.send(this.messageContents));

            console.log("Join message extension loaded.");
        } catch (e) {
            console.error("Something went wrong loading the message for new users: " + e.toString());
        }
    }

    public onWelcome(message: Discord.Message) {
        if (message.mentions.members === null) {
            message.author.send(this.messageContents);
            return;
        }

        message.mentions.members.forEach(u => u.send(this.messageContents));
    }
}
