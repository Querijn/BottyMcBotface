import fetch from "node-fetch";
import Discord = require("discord.js");
import { SharedSettings } from "./SharedSettings";
import joinArguments from "./JoinArguments";
import { clearTimeout, setTimeout } from "timers";

export enum PickemPrintMode {
    GROUP = "GROUP", BRACKET = "BRACKET", BOTH = "BOTH",
}

interface PickemLeaderboardEntry {
    id: number;
    rank: number;
    points: number;
    summonerName: string;
}

interface PickemLeaderboard {
    listSeriesId: number;
    listCreatorId: number;
    listName: string;
    secretToken: string | null;
    hasPoints: boolean;
    hasSocialMediaLinks: boolean;
    modifiable: boolean;
    shareable: boolean;
    leavable: boolean;
    promoted: boolean;
    stageToRankings: { [key: string]: PickemLeaderboardEntry[]; };
}

interface PickemTeam {
    shortName: string;
    name: string;
    logoUrl: string;
    wins: number;
    losses: number;
}

interface PickemGroup {
    name: string;
    userPoints: number;
    teams: PickemTeam[];
}

interface PickemUser {
    summonerName: string;
    id: number;
}

interface PickemUserPoints {
    summonerName: string;
    id: number;
    groupPoints: number;
    bracketPoints: number;
    totalPoints: number;
}

interface PickemGroupPick {
    user: PickemUser;
    groups: PickemGroup[];
}

interface PickemBracketTeam {
    id: number;
    name: string;
    shortName: string;
    logoUrl: string;
    largeLogoUrl: string;
    profileUrl: string;
    groupStageWins: number;
    groupStageLosses: number;
}

interface PickemBracketRoundMatch {
    slotNumber: number;
    firstTeamWins: number;
    secondTeamWins: number;
    actualFirstTeamId: number;
    actualSecondTeamId: number;
    predictedFirstTeamId: number;
    predictedSecondTeamId: number;
    predictedWinnerId: number;
    actualWinnerId: number;
}

interface PickemBracketRound {
    roundNumber: number;
    matches: PickemBracketRoundMatch[];
}

interface PickemBracketPick {
    teams: PickemBracketTeam[];
    rounds: PickemBracketRound[];
    points: number;
    user: PickemUser;
}

interface PickemPick {
    bracket: PickemBracketPick;
    group: PickemGroupPick;
    summoner: {
        name: string;
        id: number;
    };
}

export default class Pickem {
    private bot: Discord.Client;
    private settings: SharedSettings;
    private esportsChannel: Discord.GuildChannel | null = null;
    private currentMemberList: PickemUser[] = [];

    constructor(bot: Discord.Client, settings: SharedSettings) {
        this.bot = bot;
        this.settings = settings;

        bot.on("ready", async () => {
            setTimeout(async () => {
                const channel = this.settings.esports.printChannel;

                const guild = this.bot.guilds.get(this.settings.server.guildId);
                this.esportsChannel = guild!.channels.find("name", channel);
                if (this.esportsChannel == null) {
                    if (this.settings.botty.isProduction) {
                        console.error("Pickem ran into an error: We don't have an e-sports channel but we're on production!");
                    }
                    else {
                        await guild!.createChannel(channel, "text");
                    }
                }
            }, 1000);

            const ids = this.settings.pickem.listId;
            for (const id of ids) {
                await this.updateUserList(String(id));
            }
        });
    }

    public async getCorrectPickem(): Promise<PickemPick> {
        const anyGroup = await this.getGroupPicks(this.settings.pickem.worldsId, this.settings.pickem.blankId);
        const anyBracket = await this.getBracketPicks(this.settings.pickem.worldsId, this.settings.pickem.blankId);
        anyBracket.points = Number.POSITIVE_INFINITY;

        const best: PickemGroupPick = { user: { summonerName: "The Correct Choice", id: -1 }, groups: [] };
        for (const group of anyGroup.groups) {
            best.groups.push({ name: group.name, teams: group.teams.sort(this.pickemTeamCompareFunction), userPoints: Number.POSITIVE_INFINITY });
        }

        return { bracket: anyBracket, group: best, summoner: { name: "The Correct Choice", id: -1 } };
    }

    public pickemTeamCompareFunction(a: PickemTeam, b: PickemTeam): number {
        if (a.wins !== b.wins) return b.wins - a.wins;
        if (a.losses === b.losses) return a.name.localeCompare(b.name);
        return a.losses - b.losses;
    }

    public async getPickemPoints(series: number, users: number[]): Promise<PickemUserPoints[]> {
        let url = this.settings.pickem.pointsUrl;
        url = url.replace("{series}", String(this.settings.pickem.worldsId));

        for (const user of users) {
            url += user;
            url += "&user=";
        }

        const data = await fetch(url);
        return (await data.json()) as PickemUserPoints[];
    }

    public async updateUserList(listId: string) {
        const url = this.settings.pickem.leaderboardUrl.replace("{listId}", listId);
        const data = await fetch(url);
        const leaderboard: PickemLeaderboard = await data.json();

        for (const entry of leaderboard.stageToRankings["both"]) {
            const newItem = { summonerName: entry.summonerName, id: entry.id };
            if (this.currentMemberList.indexOf(newItem) === -1) {
                this.currentMemberList.push(newItem);
            }
        }

        setTimeout(this.updateUserList.bind(this, listId), this.settings.pickem.updateTimeout);
    }

    public async printLeaderboard(channel: Discord.TextChannel) {
        const ids: number[] = [];
        this.currentMemberList.forEach(i => ids.push(i.id));

        const points = await this.getPickemPoints(this.settings.pickem.worldsId, ids);
        const sorted = points.sort((a, b) => b.totalPoints - a.totalPoints);

        const embed = new Discord.RichEmbed();
        embed.setTitle("Top scores:");

        let list = "";
        let place = 1;
        for (let i = 0; i < 5; i++) {
            if (i > 0) {
                if (sorted[i - 1].totalPoints !== sorted[i].totalPoints) {
                    place = i + 1;
                }
            }

            list += `${place}. ${sorted[i].summonerName} : ${sorted[i].totalPoints}\n`;
        }

        embed.addField("Leaderboard", list);
        channel.send({ embed });
    }

    public async getGroupPicks(series: number, user: number): Promise<PickemGroupPick> {
        let url = this.settings.pickem.groupPickUrl;
        url = url.replace("{series}", String(series));
        url = url.replace("{user}", String(user));

        return (await (await fetch(url)).json());
    }

    public async getBracketPicks(series: number, user: number): Promise<PickemBracketPick> {
        let url = this.settings.pickem.bracketsUrl;
        url = url.replace("{series}", String(series));
        url = url.replace("{user}", String(user));

        return (await (await fetch(url)).json());
    }

    public generateEmbedGroupPickem(match: PickemGroupPick) {
        const embed = new Discord.RichEmbed();
        embed.setTitle(match.user.id >= 0 ? `${match.user.summonerName}'s pickem` : "Current standings");
        let formattingIndex = 0;
        for (const group of match.groups) {
            let value = "";
            let index = 1;
            for (const team of group.teams) {
                value += `${index++}. ${team.name} (${team.wins}-${team.losses})\n`;
            }
            const pointsField = group.userPoints !== Number.POSITIVE_INFINITY ? `(${group.userPoints} points)` : "";
            embed.addField(`${group.name} ${pointsField}`, value, true);

            if (++formattingIndex % 2 === 0) {
                embed.addBlankField();
            }
        }

        return embed;
    }

    public getTeamShortFromId(id: number, teams: PickemBracketTeam[]): string {
        const team = teams.find(t => t.id === id);
        if (team) {
            return team.shortName.padEnd(4);
        }
        return "".padEnd(4);
    }

    public generateBracket(pick: PickemBracketPick) {
        const firstMatch = pick.rounds[0].matches[0];
        const secondMatch = pick.rounds[0].matches[1];
        const thirdMatch = pick.rounds[0].matches[2];
        const forthMatch = pick.rounds[0].matches[3];
        const fifthMatch = pick.rounds[1].matches[0];
        const sixthMatch = pick.rounds[1].matches[1];
        const seventhMatch = pick.rounds[2].matches[0];

        const t11 = this.getTeamShortFromId(firstMatch.actualFirstTeamId, pick.teams);
        const t12 = this.getTeamShortFromId(firstMatch.actualSecondTeamId, pick.teams);
        const t13 = this.getTeamShortFromId(secondMatch.actualFirstTeamId, pick.teams);
        const t14 = this.getTeamShortFromId(secondMatch.actualSecondTeamId, pick.teams);
        const t15 = this.getTeamShortFromId(thirdMatch.actualFirstTeamId, pick.teams);
        const t16 = this.getTeamShortFromId(thirdMatch.actualSecondTeamId, pick.teams);
        const t17 = this.getTeamShortFromId(forthMatch.actualFirstTeamId, pick.teams);
        const t18 = this.getTeamShortFromId(forthMatch.actualSecondTeamId, pick.teams);

        let t21 = this.getTeamShortFromId(fifthMatch.predictedFirstTeamId, pick.teams);
        let t22 = this.getTeamShortFromId(fifthMatch.predictedSecondTeamId, pick.teams);
        let t23 = this.getTeamShortFromId(sixthMatch.predictedFirstTeamId, pick.teams);
        let t24 = this.getTeamShortFromId(sixthMatch.predictedSecondTeamId, pick.teams);
        let t31 = this.getTeamShortFromId(seventhMatch.predictedFirstTeamId, pick.teams);
        let t32 = this.getTeamShortFromId(seventhMatch.predictedSecondTeamId, pick.teams);
        let t41 = this.getTeamShortFromId(seventhMatch.predictedWinnerId, pick.teams);

        if (pick.points === Number.POSITIVE_INFINITY) {
            t21 = this.getTeamShortFromId(fifthMatch.actualFirstTeamId, pick.teams);
            t22 = this.getTeamShortFromId(fifthMatch.actualSecondTeamId, pick.teams);
            t23 = this.getTeamShortFromId(sixthMatch.actualFirstTeamId, pick.teams);
            t24 = this.getTeamShortFromId(sixthMatch.actualSecondTeamId, pick.teams);
            t31 = this.getTeamShortFromId(seventhMatch.actualFirstTeamId, pick.teams);
            t32 = this.getTeamShortFromId(seventhMatch.actualSecondTeamId, pick.teams);
            t41 = this.getTeamShortFromId(seventhMatch.actualWinnerId, pick.teams);
        }

        const pointPrint = pick.points !== Number.POSITIVE_INFINITY ? pick.points + " Points!" : "";

        const lines: string[] = [];
        lines[0] = `╺ ${t11}━┓`;
        lines[1] = `       ┣━ ${t21}━┓`;
        lines[2] = `╺ ${t12}━┛       ┃`;
        lines[3] = `               ┣━━ ${t31}━┓`;
        lines[4] = `╺ ${t13}━┓       ┃        ┃`;
        lines[5] = `       ┣━ ${t22}━┛        ┃`;
        lines[6] = `╺ ${t14}━┛                ┃`;
        lines[7] = `                        ┣━ ${t41}━╸  ${pointPrint}`;
        lines[8] = `╺ ${t15}━┓                ┃`;
        lines[9] = `       ┣━ ${t23}━┓        ┃`;
        lines[10] = `╺ ${t16}━┛       ┃        ┃`;
        lines[11] = `               ┣━━ ${t32}━┛`;
        lines[12] = `╺ ${t17}━┓       ┃`;
        lines[13] = `       ┣━ ${t24}━┛`;
        lines[14] = `╺ ${t18}━┛`;

        return "```" + lines.join("\n") + "```";
    }

    public async onPickem(message: Discord.Message, isAdmin: boolean, command: string, args: string[], separators: string[]) {

        if (!(message.channel instanceof Discord.DMChannel) && this.esportsChannel && message.channel.id !== this.esportsChannel.id) {
            message.channel.send(`To avoid spoilers, this command is restricted to #${this.esportsChannel.name}.`);
            return;
        }

        if (args.length > 1) args[0] = joinArguments(args, separators);

        if (args.length === 0) {
            const bestPick = await this.getCorrectPickem();
            this.doPrint(message.channel as Discord.TextChannel, bestPick.group, bestPick.bracket);
            return;
        }

        if (args[0] === "leaderboard") {
            this.printLeaderboard(message.channel as Discord.TextChannel);
            return;
        }

        const match = this.currentMemberList.filter(a => a.summonerName.replace(/\s/g, "").toLowerCase() === args[0].replace(/\s/g, "").toLowerCase())[0];
        if (match) {
            const group = await this.getGroupPicks(this.settings.pickem.worldsId, match.id);
            const bracket = await this.getBracketPicks(this.settings.pickem.worldsId, match.id);
            this.doPrint(message.channel as Discord.TextChannel, group, bracket);
            return;
        }
        message.channel.send("No pickem with that summoner name found..");
    }

    public doPrint(channel: Discord.TextChannel, group: PickemGroupPick, bracket: PickemBracketPick) {
        switch (this.settings.pickem.printMode) {
            case PickemPrintMode.BOTH: {
                channel.send({ embed: this.generateEmbedGroupPickem(group) });
                channel.send(this.generateBracket(bracket));
                break;
            }
            case PickemPrintMode.GROUP: {
                channel.send({ embed: this.generateEmbedGroupPickem(group) });
                break;
            }
            case PickemPrintMode.BRACKET: {
                channel.send(this.generateBracket(bracket));
                break;
            }
        }
    }
}
