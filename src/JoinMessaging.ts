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
    private commandContents: Discord.RichEmbed[];
    private commandController: CommandController;

    constructor(bot: Discord.Client, sharedSettings: SharedSettings, commandController: CommandController) {
        console.log("Requested join message extension..");

        this.sharedSettings = sharedSettings;
        console.log("Successfully loaded join message settings.");

        this.commandController = commandController;

        this.bot = bot;
        this.bot.on("ready", this.onBot.bind(this));
    }

    public onWelcome(message: Discord.Message, isAdmin: boolean, command: string, args: string[]) {
        message.channel.send(this.messageContents);
        this.commandContents.forEach(e => message.channel.send({ embed: e }));
    }

    private onBot() {
        try {
            this.messageContents = fs.readFileSync(this.sharedSettings.onJoin.messageFile, "utf8").toString();
            this.commandContents = this.commandController.getHelp();

            this.bot.on("guildMemberAdd", (user: GuildMember) => {
                user.send(this.messageContents);
                this.commandContents.forEach(e => user.send({ embed: e }));
            });

            console.log("Join message extension loaded.");
        } catch (e) {
            console.error("Something went wrong loading the message for new users: " + e.toString());
        }
    }
}
