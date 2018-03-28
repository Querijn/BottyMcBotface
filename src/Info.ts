import { CommandHandler } from "./CommandController";
import { fileBackedObject } from "./FileBackedObject";
import { SharedSettings } from "./SharedSettings";

import VersionChecker from "./VersionChecker";

import Discord = require("discord.js");

export interface InfoData {
    command: string;
    message: string;
    counter: number;
}

const findOne = (arr1: Discord.Collection<string, Discord.Role>, arr2: any[]) => {
    return arr2.some(x => arr1.has(x));
};

export default class Info implements CommandHandler {
    private infos: InfoData[];
    private sharedSettings: SharedSettings;
    private command: string;
    private versionChecker: VersionChecker;

    constructor(sharedSettings: SharedSettings, userFile: string, versionChecker: VersionChecker) {
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

    public onCommand(message: Discord.Message, isAdmin: boolean, command: string, args: string[]) {

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

        if (command.length === 0) return null;
        if (command.length > 300) return { message: `Stop it. Get some help.`, counter: 0, command };

        const info = this.infos.find(inf => {
            return inf.command === command;
        });

        if (!info) {
            const data = this.infos.slice()
                .map(i => {
                    return {
                        command: i.command,
                        score: this.levenshteinDistance(command, i.command),
                    };
                })
                .filter(s => s.score <= this.sharedSettings.info.maxScore)
                .sort((a, b) => a.score - b.score);

            if (data.length !== 0) {
                let message = "Did you mean: ";
                message += data.map(s => "`" + s.command + "`").join(", ") + "?";
                return { message, counter: 0, command };
            }

            return { message: `No note with the name ${command} was found.`, counter: 0, command };
        }

        // Backwards compatibility
        if (info.counter === undefined || info.counter === null) {
            info.counter = 0;
        }

        info.counter++;
        return info;
    }

    /**
     * Counts the substitutions needed to transform a into b
     * source adapted from: https://en.wikipedia.org/wiki/Levenshtein_distance#Iterative_with_two_matrix_rows
     * @param a first string
     * @param b seconds string
     */
    private levenshteinDistance(a: string, b: string): number {
        if (a === b) {
            return 0;
        }

        if (a.length === 0) {
            return b.length;
        }

        if (b.length === 0) {
            return a.length;
        }

        let v0 = [];
        const v1 = [];

        for (let i = 0; i < b.length + 1; i++) {
            v0[i] = i;
            v1[i] = 0;
        }

        for (let i = 0; i < a.length; i++) {
            v1[0] = i + 1;

            for (let j = 0; j < b.length; j++) {
                const cost = a[i] === b[j] ? 0 : 1;

                const deletionCost = v0[j + 1] + 1;
                const insertCost = v1[j] + 1;
                const substituteCost = v0[j] + cost;
                const minCost = Math.min(Math.min(deletionCost, insertCost), substituteCost);

                v1[j + 1] = minCost;
            }
            v0 = v1.slice();
        }

        return v1[b.length];
    }
}
