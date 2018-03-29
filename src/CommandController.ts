import Discord = require("discord.js");
import { SharedSettings } from "./SharedSettings";

type SingleCommand = (message: Discord.Message, isAdmin: boolean, command: string, args: string[]) => void;

export interface CommandHolder {
    command: Command;
    handler: SingleCommand;
    status: CommandStatus;
    prefix: string;
}

enum CommandStatus {
    ENABLED = 1, DISABLED = 0,
}

export interface Command {
    aliases: string[];
    description: string;
    prefix: string;
    admin: boolean;
}

export interface CommandList {
    controller: {
        toggle: Command;
        help: Command;
    };
    uptime: Command;
    autoReact: {
        toggle_default_thinking: Command;
        toggle_react: Command;
        refresh_thinking: Command;
    };
    info: {
        all: Command,
        note: Command,
    };
    officeHours: {
        open: Command;
        close: Command;
        ask: Command;
        ask_for: Command;
        question_list: Command;
        question_remove: Command;
    };
    riotApiLibraries: Command;
    apiStatus: Command;
}

export default class CommandController {

    private sharedSettings: SharedSettings;
    private commands: CommandHolder[] = [];
    private client: Discord.Client;

    constructor(bot: Discord.Client, sharedSettings: SharedSettings) {
        this.sharedSettings = sharedSettings;
        this.client = bot;

        bot.on("message", this.handleCommands.bind(this));
    }

    public onToggle(message: Discord.Message, isAdmin: boolean, command: string, args: string[]) {
        if (args.length !== 1) return;

        const filtered = this.commands.filter(handler => handler.command.aliases.some(alias => handler.prefix + alias === args[0]));
        if (filtered.length === 0) {
            message.channel.send(`No command with the name ${args[0]} was found.`);
            return;
        }

        for(let handler of filtered) {
            handler.status = (handler.status === CommandStatus.ENABLED ? CommandStatus.DISABLED : CommandStatus.ENABLED);
            message.channel.send(`${handler.prefix + handler.command.aliases.join("/")} is now ${handler.status === CommandStatus.ENABLED ? "enabled" : "disabled"}.`);
        }
    }

    public onHelp(message: Discord.Message, isAdmin: boolean, command: string, args: string[]) {
        let response = "\n";

        const toString = (holder: CommandHolder) => {

            let str = "";
            if (holder.status === CommandStatus.DISABLED) {
                str += "~~";
            }

            str += `\`${holder.prefix}${holder.command.aliases}\``;

            if (holder.status === CommandStatus.DISABLED) {
                str += "~~";
            }

            str += `: ${holder.command.description}`;
            if (holder.status === CommandStatus.DISABLED) {
                str += " (command is disabled)";
            }

            return str + "\n";
        };

        this.commands
            // ignore "*" commands
            .filter(holder => holder.command.aliases.some(a => a !== "*"))
            // hide admin commands if not admin
            .filter(holder => isAdmin || !holder.command.admin)
            .forEach(holder => response += toString(holder));

        message.reply(response);
    }

    public registerCommand(newCommand: Command, commandHandler: SingleCommand) {
        this.commands.push({
            command: newCommand,
            handler: commandHandler,
            prefix: newCommand.prefix || this.sharedSettings.commands.default_prefix,
            status: CommandStatus.ENABLED,
        });
    }

    private handleCommands(message: Discord.Message) {
        if (message.author.bot) return;

        const parts = message.content.split(" ");
        const prefix = parts[0][0];
        const command = parts[0].substr(1);
        const isAdmin = (message.member && this.sharedSettings.commands.adminRoles.some(x => message.member.roles.has(x)));

        this.commands.forEach(holder => {
            if (holder.status === CommandStatus.DISABLED) return;
            if (holder.command.admin && !isAdmin) return;
            if (holder.prefix === prefix) {

                // handlers that register the "*" command will get all commands with that prefix (unless they already have gotten it once)
                if (holder.command.aliases.some(x => x === command)) {
                    holder.handler.call(null, message, isAdmin, command, parts.slice(1));
                    return;
                }

                if (holder.command.aliases.some(x => x === "*")) {
                    holder.handler.call(null, message, isAdmin, "*", Array<string>().concat(command, parts.slice(1)));
                }
            }
        });
    }
}
