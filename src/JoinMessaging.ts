import Discord = require("discord.js");
import fs = require("fs");

import CommandController from "./CommandController";

import { GuildMember } from "discord.js";
import { SharedSettings } from "./SharedSettings";

interface Messagable {
    send(content?: Discord.StringResolvable, options?: Discord.MessageOptions | Discord.RichEmbed | Discord.Attachment): Promise<Discord.Message | Discord.Message[]>;
    send(options?: Discord.MessageOptions | Discord.RichEmbed | Discord.Attachment): Promise<Discord.Message | Discord.Message[]>;
}

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
        this.sendWelcomeMessage(message.channel);
    }

    public sendWelcomeMessage(channel: Messagable) {
        channel.send(this.messageContents, { split: true });
        this.commandContents.forEach(embed => channel.send({ embed, split: true }));
    }

    private onBot() {
        try {
            this.messageContents = fs.readFileSync(this.sharedSettings.onJoin.messageFile, "utf8").toString();
            this.commandContents = this.commandController.getHelp();

            this.bot.on("guildMemberAdd", (user: GuildMember) => {
                this.sendWelcomeMessage(user);
            });

            console.log("Join message extension loaded.");
        }
        catch (e) {
            console.error("Something went wrong loading the message for new users: " + e.toString());
        }
    }
}
