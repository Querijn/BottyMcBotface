import Discord = require("discord.js");
import fs = require("fs");

import CommandController from "./CommandController";

import { GuildMember } from "discord.js";
import { fileBackedObject } from "./FileBackedObject";
import { SharedSettings } from "./SharedSettings";

export default class JoinMessaging {
    private sharedSettings: SharedSettings;
    private messageContents: string;
    private commandContents: string;
    private commandController: CommandController;

    constructor(sharedSettings: SharedSettings, commandController: CommandController) {
        console.log("Requested join message extension..");

        this.sharedSettings = sharedSettings;
        console.log("Successfully loaded join message settings.");

        this.commandController = commandController;
    }

    public onReady(bot: Discord.Client) {
        try {
            this.messageContents = fs.readFileSync(this.sharedSettings.onJoin.messageFile, "utf8").toString();
            this.commandContents = this.commandController.getHelp();

            console.log("Join message extension loaded.");
        } catch (e) {
            console.error("Something went wrong loading the message for new users: " + e.toString());
        }
    }

    public onGuildMemberAdd(user: Discord.GuildMember) {
        user.send(this.messageContents);
        user.send(this.commandContents);
    }

    public onWelcome(message: Discord.Message, isAdmin: boolean, command: string, args: string[]) {
        message.channel.send(this.messageContents);
        message.channel.send(this.commandContents);
    }
}
