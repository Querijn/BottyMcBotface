import Discord = require("discord.js");
import { fileBackedObject } from "./FileBackedObject";
import { SharedSettings } from "./SharedSettings";

type SingleCommand = (message: Discord.Message, isAdmin: boolean, command: string, args: string[]) => void;

export interface CommandHolder {
    identifier: string;
    command: Command;
    handler: SingleCommand;
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
    welcome: Command;
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
    private commandStatuses: { [commandName: string]: CommandStatus } = {};

    constructor(sharedSettings: SharedSettings, commandData: string) {
        this.sharedSettings = sharedSettings;

        this.commandStatuses = fileBackedObject(commandData);
    }

    public onToggle(message: Discord.Message, isAdmin: boolean, command: string, args: string[]) {
        if (args.length !== 1) return;

        const filtered = this.commands.filter(handler => handler.command.aliases.some(alias => handler.prefix + alias === args[0]));
        if (filtered.length === 0) {
            message.channel.send(`No command with the name ${args[0]} was found.`);
            return;
        }

        for (const handler of filtered) {
            this.commandStatuses[handler.identifier] = (this.getStatus(handler) === CommandStatus.DISABLED ? CommandStatus.ENABLED : CommandStatus.DISABLED);
            message.channel.send(`${handler.prefix + handler.command.aliases.join("/")} is now ${this.getStatus(handler) === CommandStatus.ENABLED ? "enabled" : "disabled"}.`);
        }
    }

    public getHelp(isAdmin: boolean = false): string {
        let response = "\n";

        const toString = (holder: CommandHolder) => {

            let str = "";
            if (this.getStatus(holder) === CommandStatus.DISABLED) {
                str += "~~";
            }

            str += `\`${holder.prefix}${holder.command.aliases}\``;

            if (this.getStatus(holder) === CommandStatus.DISABLED) {
                str += "~~";
            }

            str += `: ${holder.command.description}`;
            if (this.getStatus(holder) === CommandStatus.DISABLED) {
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

        return response;
    }

    public onHelp(message: Discord.Message, isAdmin: boolean, command: string, args: string[]) {

        message.channel.send(this.getHelp(isAdmin));
    }

    public registerCommand(newCommand: Command, commandHandler: SingleCommand) {
        this.commands.push({
            identifier: commandHandler.name,
            command: newCommand,
            handler: commandHandler,
            prefix: newCommand.prefix || this.sharedSettings.commands.default_prefix,
        });
    }

    public onMessage(message: Discord.Message) {
        if (message.author.bot) return;

        const parts = message.content.split(" ");
        const prefix = parts[0][0];
        const command = parts[0].substr(1);
        const isAdmin = (message.member && this.sharedSettings.commands.adminRoles.some(x => message.member.roles.has(x)));

        this.commands.forEach(holder => {

            if (this.getStatus(holder) === CommandStatus.DISABLED) return;
            if (holder.command.admin && !isAdmin) return;
            if (holder.prefix !== prefix) return;

            // handlers that register the "*" command will get all commands with that prefix (unless they already have gotten it once)
            if (holder.command.aliases.some(x => x === command)) {
                holder.handler.call(null, message, isAdmin, command, parts.slice(1));
            } else if (holder.command.aliases.some(x => x === "*")) {
                holder.handler.call(null, message, isAdmin, "*", Array<string>().concat(command, parts.slice(1)));
            }
        });
    }

    private getStatus(holder: CommandHolder): CommandStatus {
        return this.commandStatuses[holder.identifier];
    }
}
