import { fileBackedObject } from "./FileBackedObject";
import { SharedSettings } from "./SharedSettings";

import url = require("url");

import Botty from "./Botty";
import CategorisedMessage from "./CategorisedMessage";
import Discord = require("discord.js");
import { levenshteinDistance } from "./LevenshteinDistance";
import VersionChecker from "./VersionChecker";
import joinArguments from "./JoinArguments";

interface InfoFile {
    messages: InfoData[];
    categories: Category[];
}

interface Category {
    icon: string;
    explanation: string;
}

export interface InfoData {
    command: string;
    message: string;
    counter: number;
    categoryId: string;
}

class ReactionListener {
    public user: Discord.User;
    public message: Discord.Message;
    public callback: (emoji: Discord.ReactionEmoji | Discord.Emoji, listener: ReactionListener) => void;
}

export default class Info {
    private userId: string;
    private infos: InfoData[];
    private categories: Category[] = [];
    private sharedSettings: SharedSettings;
    private command: string;
    private versionChecker: VersionChecker;

    private adminCommands = ["add", "remove", "replace", "rename"];
    private badNoteNames = ["list"];

    private reactionListeners: ReactionListener[] = [];
    private categorisedMessages: { [msgId: string]: CategorisedMessage } = {};

    constructor(botty: Botty, sharedSettings: SharedSettings, userFile: string, versionChecker: VersionChecker) {
        console.log("Requested Info extension..");
        this.command = sharedSettings.info.command;
        this.versionChecker = versionChecker;
        this.sharedSettings = sharedSettings;

        const file = fileBackedObject<InfoFile>(userFile, "www/" + userFile);
        this.infos = file.messages;

        console.log("Successfully loaded info file.");

        botty.client.on("messageReactionAdd", this.onReaction.bind(this));
        botty.client.on("ready", () => {

            this.userId = botty.client.user.id;

            for (const category of file.categories) {

                if (category.icon.indexOf("%") >= 0) {
                    // TODO: Better identifier for Unicode emojis
                    this.categories.push(category);
                    continue;
                }

                const emoji = botty.client.emojis.get(category.icon);
                if (!emoji) {
                    console.warn(`Cannot find emoji ${category} for the info categories!`);
                    continue;
                }

                this.categories.push({
                    icon: emoji.identifier,
                    explanation: category.explanation,
                });
            }
        });
    }

    public onReaction(messageReaction: Discord.MessageReaction, user: Discord.User) {

        if (user.id === this.userId) return;

        const listener = this.reactionListeners.find(l => l.message.id === messageReaction.message.id && messageReaction.users.has(user.id));
        if (!listener) return;

        if (listener.user.id === user.id) {
            listener.callback(messageReaction.emoji, listener);
        }

        // Remove reaction if we're on our server.
        if (messageReaction.message.guild && messageReaction.message.guild.id === this.sharedSettings.server) {
            messageReaction.remove(user);
        }
    }

    public async onAll(message: Discord.Message, isAdmin: boolean, command: string, args: string[]) {
        let response: string | undefined;
        if (args.length === 0) return;
        const name = args[0].toLowerCase();

        const regexp = /^[a-z0-9-]+$/i;
        if (!regexp.test(name)) return;

        const infoData = this.fetchInfo(name);

        // if we got a valid note, replace variables
        if (infoData) {
            response = infoData.message;
            response = response.replace(/{ddragonVersion}/g, this.versionChecker.ddragonVersion);
            response = response.replace(/{gameVersion}/g, this.versionChecker.gameVersion);
            response = response.replace(/{counter}/g, (infoData.counter || 0).toString());
        }

        // if we didnt get a valid note from fetchInfo, we return;
        if (!response) return;

        try {
            await message.channel.send(response);
        }
        catch (e) {
            if (e instanceof Discord.DiscordAPIError) {
                console.error(`Received DiscordAPIError while outputting an info ticket: ${e.code} "${e.message}"`);
            }
            else {
                console.error(`Received unknown error while outputting an info ticket: ${e}"`);
            }
        }
    }

    public async onNote(message: Discord.Message, isAdmin: boolean, command: string, args: string[], separators: string[]) {

        // the note we are trying to fetch (or the sub-command)
        const action = args[0];

        // if no params, we print the list
        if (args.length === 0) {
            this.handleNoteList(message, false);
            return;
        }

        // a non-admin account tried to use one of the sub-commands, so we stop
        if (!isAdmin && this.adminCommands.some(x => x === action)) {
            return;
        }

        if (action === "list") {
            this.handleNoteList(message, args[1] === "here");
            return;
        }

        if (action === "add") {
            this.handleNoteAdd(message, isAdmin, command, args, separators);
            return;
        }

        if (action === "remove") {
            this.handleNoteRemove(message, isAdmin, command, args);
            return;
        }

        if (action === "rename") {
            this.handleNoteRename(message, isAdmin, command, args);
            return;
        }

        if (action === "replace") {
            this.handleNoteReplace(message, isAdmin, command, args, separators);
            return;
        }

        return this.onAll(message, isAdmin, command, args);
    }

    private handleNoteReplace(message: Discord.Message, isAdmin: boolean, command: string, args: string[], separators: string[]) {
        // we need more than 2 arguments to replace a note.
        //   cmd    1     2     3++
        // (!note replace name data...)
        if (args.length <= 2) {
            return;
        }

        const noteName = args[1].toLowerCase();

        const info = this.infos.find(inf => {
            return inf.command === noteName;
        });

        if (info) {
            const body = joinArguments(args, separators, 2);
            info.message = body;

            message.channel.send(`Note '${noteName}' has been changed to:\n${body}`);
            return;
        }

        message.channel.send("Unable to find note with that name!");
    }

    private handleNoteRename(message: Discord.Message, isAdmin: boolean, command: string, args: string[]) {
        // we need 3 arguments to rename a note.
        //   cmd    1     2      3
        // (!note rename name newname)
        if (args.length !== 3) {
            return;
        }

        const noteName = args[1].toLowerCase();
        const newNoteName = args[2].toLowerCase();

        if (this.adminCommands.indexOf(newNoteName) >= 0 || this.badNoteNames.indexOf(newNoteName) >= 0) {
            message.channel.send("This note is a note command or a disallowed note name, and cannot be used.");
            return;
        }

        const info = this.infos.find(inf => {
            return inf.command === noteName;
        });

        if (info) {

            const other = this.infos.find(inf => {
                return inf.command === newNoteName;
            });

            if (!other) {
                info.command = newNoteName;
                message.channel.send(`Note '${noteName}' has been renamed to '${newNoteName}'`);
                return;
            }

            message.channel.send(`Note '${newNoteName}' already exists`);
            return;
        }

        message.channel.send("Unable to find note with that name!");
    }

    private handleNoteRemove(message: Discord.Message, isAdmin: boolean, command: string, args: string[]) {
        // we need 2 arguments to remove a note.
        //   cmd    1     2
        // (!note remove name)
        if (args.length !== 2) {
            return;
        }

        const noteName = args[1].toLowerCase();

        const index = this.infos.findIndex(info => {
            return info.command === noteName;
        });

        if (index === -1) return;

        this.infos.splice(index, 1);
        message.channel.send(`Successfully removed ${noteName}`);
    }

    private async handleNoteAdd(message: Discord.Message, isAdmin: boolean, command: string, args: string[], separators: string[]) {
        // we need atleast 3 arguments to add a note.
        //  cmd   1   2    3
        // (!note add name message)
        if (args.length < 3) {
            return;
        }

        const name = args[1].toLowerCase();
        const text = joinArguments(args, separators, 2);

        if (this.adminCommands.indexOf(name) >= 0 || this.badNoteNames.indexOf(name) >= 0) {
            message.channel.send("This note is a note command or a disallowed note name, and cannot be used.");
            return;
        }

        let reply = await message.channel.send("What category would you like to put it in?");
        if (Array.isArray(reply)) reply = reply[0];

        this.addReactionListener({
            user: message.author,
            message: reply,
            callback: async (emoji: Discord.Emoji, listener: ReactionListener) => {

                if (!this.categories.find(c => emoji.identifier === c.icon))
                    return; // Not a valid category.

                try {
                    await message.channel.send(this.addInfo(name, text, emoji));
                }
                catch (e) {
                    if (e instanceof Discord.DiscordAPIError) {
                        console.error(`Received DiscordAPIError while outputting an add info message: ${e.code} "${e.message}"`);
                    }
                    else {
                        console.error(`Received unknown error while outputting an add info message: ${e}"`);
                    }
                }
            },
        });

        for (const category of this.categories)
            await reply.react(category.icon).catch((reason) => console.log(`Cannot react with category '${category}', reason being: ${reason}`));
        return;
    }

    private addInfo(command: string, message: string, category: Discord.Emoji) {
        const alreadyExists = this.infos.some(info => info.command === command);
        if (alreadyExists) {
            return "A note with that name already exists";
        }

        if (this.adminCommands.indexOf(command) >= 0 || this.badNoteNames.indexOf(command) >= 0) {
            return "This note is a note command or a disallowed note name, and cannot be used.";
        }

        const newInfo: InfoData = {
            command,
            counter: 0,
            message,
            categoryId: category.identifier,
        };

        this.infos.push(newInfo);
        this.infos.sort((a, b) => a.command.localeCompare(b.command));
        return `Successfully added ${command} with category ${category}`;
    }

    private async handleNoteList(message: Discord.Message, isLocal: boolean) {

        const maxLength = 80;

        if (!isLocal) {
            message.channel.send(url.resolve(this.sharedSettings.botty.webServer.relativeLiveLocation, "notes"));
            return;
        }

        let firstPage: Discord.RichEmbed | null = null;
        const pages: { [emoji: string]: Discord.RichEmbed } = {};
        for (const category of this.categories) {
            const categoryItems = this.infos.filter(i => i.categoryId === category.icon);

            const page = new Discord.RichEmbed();
            page.setTitle(category.explanation);

            for (const item of categoryItems) {
                const content = item.message.length > maxLength ? item.message.substr(0, maxLength - 3) + "..." : item.message;
                page.addField("!note " + item.command, content, false);
            }

            if (!firstPage) firstPage = page;
            pages[category.icon] = page;
        }

        let reply = await message.channel.send({ embed: firstPage });
        if (Array.isArray(reply)) reply = reply[0];

        this.categorisedMessages[reply.id] = new CategorisedMessage(pages);

        this.addReactionListener({
            user: message.author,
            message: reply,
            callback: (emoji: Discord.Emoji, listener: ReactionListener) => {

                const cat = this.categories.find(c => emoji.identifier === c.icon);
                if (!cat) return; // Not a valid category.

                const page = this.categorisedMessages[listener.message.id].setPage(emoji);

                listener.message.edit({ embed: page });
            },
        });

        for (const category of this.categories)
            await reply.react(category.icon).catch((reason) => console.log(`Cannot react with category '${category}', reason being: ${reason}`));
    }

    private fetchInfo(command: string): InfoData | null {

        if (command.length === 0) return null;
        if (command.length > 300) return { message: `Stop it. Get some help.`, counter: 0, command, categoryId: "" };

        let info = this.infos.find(inf => {
            return inf.command === command;
        });

        if (!info) {
            const data = this.infos.slice()
                .map(i => {
                    return {
                        command: i.command,
                        score: levenshteinDistance(command, i.command),
                    };
                })
                .filter(s => s.score <= this.sharedSettings.info.maxScore)
                .sort((a, b) => a.score - b.score);

            // if there is more than one note, print the list
            if (data.length > 1) {
                let message = "Did you mean: ";
                message += data.map(s => "`" + s.command + "`").join(", ") + "?";
                return { message, counter: 0, command, categoryId: "" };
            }

            if (data.length === 1) {
                // if theres only one note, use it..
                const orig = this.infos.find(x => x.command === data[0].command)!;

                // Return a copy
                info = Object.assign({}, orig);
                info.message = `Assuming you meant \`${info.command}\`: ${info.message}`;

                orig.counter = orig.counter != null ? orig.counter + 1 : 0;
            }

            if (!info) {
                return { message: `No note with the name ${command} was found.`, counter: 0, command, categoryId: "" };
            }
        }

        // Backwards compatibility
        if (info.counter === undefined || info.counter === null) {
            info.counter = 0;
        }

        info.counter++;
        return info;
    }

    private addReactionListener(listener: ReactionListener) {
        this.reactionListeners.push(listener);

        // Remove old listeners.
        if (this.reactionListeners.length > this.sharedSettings.info.maxListeners) {
            const oldListener = this.reactionListeners.splice(0, 1)[0];
            oldListener.message.delete();
        }
    }
}
