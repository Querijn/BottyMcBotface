import Discord = require("discord.js");
import { SharedSettings } from "./SharedSettings";

export interface CommandHandler {
    onReady(bot: Discord.Client): void;
    onCommand(message: Discord.Message, isAdmin: boolean, command: string, args: string[]): void;
}

export interface SingleCommand {
    onCommand(message: Discord.Message, isAdmin: boolean, command: string, args: string[]): void;
}

export interface CommandHolder {
    command: Command;
    handler: (CommandHandler | SingleCommand);
    prefix: string;
}

export interface Command {
    aliases: string[];
    description: string;
    prefix: string;
    admin: boolean;
}

export interface CommandList {
    botty: Command[];
    channelAccess: Command[];
    uptime: Command[];
    autoReact: Command[];
    info: Command[];
    officeHours: Command[];
    riotApiLibraries: Command[];
    apiStatus: Command[];
}

export default class CommandController {

    private sharedSettings: SharedSettings;
    private commands: CommandHolder[] = [];
    private client: Discord.Client;

    constructor(bot: Discord.Client, sharedSettings: SharedSettings) {
        this.sharedSettings = sharedSettings;
        this.client = bot;

        bot.on("message", this.handleCommands.bind(this));
        this.registerCommand([
            {
                aliases: ["help"],
                description: "Prints all the commands",
            },
        ] as Command[], { onCommand: this.onCommand } as SingleCommand);
    }

    public onCommand(message: Discord.Message, isAdmin: boolean, command: string, args: string[]) {
        let response = "\n";

        this.commands
            // ignore "*" commands
            .filter(holder => holder.command.aliases.some(a => a !== "*"))
            // hide admin commands
            .filter(holder => isAdmin || !holder.command.admin)
            .forEach(holder => response += `\`${holder.prefix}${holder.command.aliases}\`: ${holder.command.description}\n`);

        message.reply(response);
    }

    public registerCommand(newCommand: Command[], commandHandler: (CommandHandler | SingleCommand)) {
        newCommand.forEach(cmd => {
            this.commands.push({
                command: cmd,
                handler: commandHandler,
                prefix: cmd.prefix || this.sharedSettings.botty.prefix,
            });
        });

        if (this.isHandler(commandHandler)) {
            commandHandler.onReady(this.client);
        }
    }

    private isHandler(handler: any): handler is CommandHandler {
        return handler.onReady !== undefined;
    }

    private handleCommands(message: Discord.Message) {
        if (message.author.bot) return;

        const parts = message.content.split(" ");
        const prefix = parts[0][0];
        const command = parts[0].substr(1);
        const isAdmin = (message.member && this.sharedSettings.commands.adminRoles.some(x => message.member.roles.has(x)));

        this.commands.forEach(holder => {
            if (holder.prefix === prefix) {

                // handlers that register the "*" command will get all commands with that prefix (unless they already have gotten it once)
                if (holder.command.aliases.some(x => x === command)) {
                    holder.handler.onCommand(message, isAdmin, command, parts.slice(1));
                    return;
                }

                if (holder.command.aliases.some(x => x === "*")) {
                    holder.handler.onCommand(message, isAdmin, "*", Array<string>().concat(command, parts.slice(1)));
                }
            }
        });
    }
}
