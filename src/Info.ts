import { fileBackedObject } from "./FileBackedObject";
import { SharedSettings } from "./SharedSettings";
import VersionChecker from "./VersionChecker";

import Discord = require("discord.js");
import { CommandHandler } from "./CommandHandler";

export interface InfoData {
    command: string;
    message: string;
    counter: number;
}

const findOne = (arr1: Discord.Collection<string, Discord.Role>, arr2: any[]) => {
    return arr2.some(x => arr1.has(x));
};

export default class Info extends CommandHandler {
    private infos: InfoData[];
    private sharedSettings: SharedSettings;
    private command: string;
    private versionChecker: VersionChecker;

    constructor(sharedSettings: SharedSettings, userFile: string, versionChecker: VersionChecker) {
        super();
        console.log("Requested Info extension..");
        this.command = sharedSettings.info.command;
        this.versionChecker = versionChecker;
        this.sharedSettings = sharedSettings;

        this.infos = fileBackedObject(userFile);
        console.log("Successfully loaded info file.");

    }

    public onReady(bot: Discord.Client) {
        console.log("Info extension loaded.");
    }

    public onCommand(message: Discord.Message, command: string, args: string[]) {

        let response: string | undefined;

        // the note we are trying to fetch (or the sub-command)
        const action = args[0];

        // if its not a .note command
        if (command !== "*") {

            // if no params, we print the list
            if (args.length === 0) {
                message.channel.send(this.listInfo());
                return;
            }
            // Things we can't fetch
            const badWords = ["add", "remove", "list"];

            // check admin status of account
            const isAdmin = (message.member && findOne(message.member.roles, this.sharedSettings.info.allowedRoles));

            // a non-admin account tried to use one of the sub-commands, so we stop
            if (!isAdmin && badWords.some(x => x === action)) {
                return;
            }

            switch (action) {
                case "add":
                    {
                        // we need atleast 3 arguments to add a note.
                        //   cmd   1   2     3
                        // (!note add name message)
                        if (args.length < 3) {
                            return;
                        }

                        const name = args[1];
                        const text = args.splice(2).join(" ");

                        message.channel.send(this.addInfo(name, text));
                        return;
                    }
                case "remove":
                    {
                        // we need 2 arguments to remove a note.
                        //   cmd    1     2
                        // (!note remove name)
                        if (args.length !== 2) {
                            return;
                        }

                        message.channel.send(this.removeInfo(args[1]));
                        return;
                    }

                case "list": {
                    message.channel.send(this.listInfo());
                    return;
                }
            }
        }

        // Retrieve note
        const infoData = this.fetchInfo(action);

        // if we got a valid note, replace variables
        if (infoData) {
            response = infoData.message;
            response = response.replace(/{ddragonVersion}/g, this.versionChecker.ddragonVersion);
            response = response.replace(/{gameVersion}/g, this.versionChecker.gameVersion);
            response = response.replace(/{counter}/g, infoData.counter.toString());
        }

        // if we didnt get a valid note from fetchInfo, we return;
        if (!response) return;

        message.channel.send(response);
    }

    private addInfo(command: string, message: string) {
        const alreadyExists = this.infos.some(info => info.command === command);
        if (alreadyExists) return;

        const newInfo: InfoData = {
            command,
            counter: 0,
            message,
        };

        this.infos.push(newInfo);
        return `Successfully added ${command}`;
    }

    private removeInfo(command: string) {
        const index = this.infos.findIndex(info => {
            return info.command === command;
        });

        if (index === -1) return;

        this.infos.splice(index, 1);
        return `Successfully removed ${command}`;
    }

    private listInfo() {
        const index = this.infos;

        let message = `The available info commands are: \n`;

        for (const info of this.infos) {
            message += `- \`!${this.command} ${info.command}\`\n`;
        }

        return message;
    }

    private fetchInfo(command: string): InfoData | null {
        const info = this.infos.find(inf => {
            return inf.command === command;
        });

        if (!info) { return null; }

        // Backwards compatibility
        if (info.counter === undefined || info.counter === null) {
            info.counter = 0;
        }

        info.counter++;
        return info;
    }
}
