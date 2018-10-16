import fetch from "node-fetch";
import Discord = require("discord.js");
import { SharedSettings } from "./SharedSettings";
import * as CheerioAPI from "cheerio";
import * as momentjs from "moment";

interface ESportsAPIReturnData {
    resultsHtml: string;
    fixturesHtml: string;
    resultsMonths: string;
    fixturesMonths: string;
}

interface ESportsLeagueSchedule {
    league: string;
    time: string;
    teamA: string;
    teamB: string;
}

interface PickemLeaderboardEntry {
    vsUserId: number;
}

interface PickemLeaderboard {
    entries: PickemLeaderboardEntry[];
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

interface PickemBracketPicks {
    teams: PickemTeam[];
    rounds: any[];
    user: PickemUser;
    points: number;
}

export default class ESportsAPI {
    private bot: Discord.Client;
    private settings: SharedSettings;

    private schedule: Map<string, Map<string, ESportsLeagueSchedule[]>> = new Map();

    private currentList: PickemGroupPick[];

    constructor(bot: Discord.Client, settings: SharedSettings) {
        this.bot = bot;
        this.settings = settings;

        bot.on("ready", async () => {

            this.updateMemberList();

            await this.loadData();
            this.postInfo();
        });
    }

    public async updateMemberList() {
        this.currentList = await this.getMembersWithName();
        setTimeout(this.updateMemberList.bind(this), this.settings.pickem.updateTimeout);
    }

    public async getCorrectPickem(): Promise<PickemGroupPick> {
        const anyPick = await this.getGroupPicks(this.settings.pickem.worldsId, this.settings.pickem.blankId);
        const best: PickemGroupPick = { user: { summonerName: "The Correct Choice", id: -1 }, groups: [] };

        for (const group of anyPick.groups) {
            best.groups.push({ name: group.name, teams: group.teams.sort(this.pickemTeamCompareFunction), userPoints: Number.POSITIVE_INFINITY });
        }

        return best;
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

    public async getMembersWithName(): Promise<PickemGroupPick[]> {
        const leaderboard = (await this.getLeaderboard()).entries;
        const returnList: PickemGroupPick[] = [];

        for (const entry of leaderboard) {
            const pickem = await this.getGroupPicks(this.settings.pickem.worldsId, entry.vsUserId);
            returnList.push(pickem);
        }

        return returnList;
    }

    public async getLeaderboard(): Promise<PickemLeaderboard> {
        let url = this.settings.pickem.leaderboardUrl;
        url = url.replace("{series}", String(this.settings.pickem.worldsId));
        url = url.replace("{user}", String(this.settings.pickem.blankId));

        const data = await fetch(url);
        return (await data.json())[0];
    }

    public async getGroupPicks(series: number, user: number): Promise<PickemGroupPick> {
        let url = this.settings.pickem.groupPickUrl;
        url = url.replace("{series}", String(series));
        url = url.replace("{user}", String(user));

        return (await (await fetch(url)).json());
    }

    public printPickem(match: PickemGroupPick) {
        for (const group of match.groups) {
            let index = 1;

            for (const team of group.teams) {
                console.log(`${index++}. ${team.name} (${team.wins}-${team.losses})`);
            }
        }
    }

    public embedPickem(match: PickemGroupPick) {
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

    public async onPickem(message: Discord.Message, isAdmin: boolean, command: string, args: string[]) {

        }

        if (args.length > 1) args[0] = args.join(" ");
        if (args.length === 0) {
            const bestPick = await this.getCorrectPickem();
            message.channel.send({ embed: this.embedPickem(bestPick) });
            return;
        }

        if (this.currentList === undefined) {
            message.channel.send(`We're updating the user-list, please retry this command in a bit..`);
            return;
        }

        if (args[0] === "leaderboard") {
            const ids: number[] = [];
            this.currentList.forEach(i => ids.push(i.user.id));

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
            message.channel.send({ embed });
            return;
        }

        const match = this.currentList.filter(a => a.user.summonerName === args[0])[0];
        if (match) {
            message.channel.send({ embed: this.embedPickem(match) });
        } else {
            message.channel.send("No pickem with that summoner name found..");
        }
    }

    public async onCheckNext(message: Discord.Message, isAdmin: boolean, command: string, args: string[]) {
        if (args.length === 0) args = ["today"];
        if (args.length !== 1) return;

        const data = args[0].trim().split(/[\/ -]/g);
        let date;

        const fullCheck = /\d{4}\/\d{1,2}\/\d{1,2}/;
        const curYearCheck = /\d{1,2}\/\d{1,2}/;

        // YYYY/MM/DD
        if (fullCheck.test(args[0])) {
            date = `${data[0]} ${parseInt(data[1], 10)} ${parseInt(data[2], 10)}`;
        }

        // MM/DD
        else if (curYearCheck.test(args[0])) {
            const currentYear = new Date().getFullYear();
            date = `${currentYear} ${parseInt(data[0], 10)} ${parseInt(data[1], 10)}`;
        }

        else if (args[0].toLowerCase() === "today") {
            const today = new Date();
            date = `${today.getFullYear()} ${today.getMonth() + 1} ${today.getDate()}`;
        }

        else if (args[0].toLowerCase() === "tomorrow") {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            date = `${tomorrow.getFullYear()} ${tomorrow.getMonth() + 1} ${tomorrow.getDate()}`;
        }

        // No match
        else {
            message.channel.send("The date you specified didn't match the format needed. (MM/DD or YYYY/MM/DD)");
            return;
        }

        const jsDate = new Date(date);
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        if (jsDate < now) {
            message.channel.send("The date has to be in the future.");
            return;
        }

        const schedule = this.schedule.get(date);
        this.sendPrintout(message.channel as Discord.TextChannel, schedule, date);
    }

    private postInfo() {
        const channel = this.settings.esports.printChannel;
        const esports = this.bot.guilds.get(this.settings.server)!.channels.find("name", channel);
        if (!esports) {
            console.error(`Esports: Unable to find channel #${channel}`);
            return;
        }

        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0);
        tomorrow.setMinutes(0);

        let tellDate = "";

        // filter to only show new games (up-to one day in advance)
        const prints: Map<string, ESportsLeagueSchedule[]> = new Map();
        for (const [dateKey, entries] of this.schedule.entries()) {
            if (new Date(dateKey) > tomorrow) break;

            tellDate = dateKey;
            for (const [league, entryList] of entries) {
                for (const item of entryList) {

                    const time = momentjs(item.time, "YYYY MM DD HH:mm");
                    if (time.isBefore(new Date())) continue;

                    if (!prints.get(league)) {
                        prints.set(league, []);
                    }

                    prints.get(league)!.push(item);
                }
            }
        }

        this.sendPrintout(esports as Discord.TextChannel, prints, tellDate);
        setTimeout(this.postInfo.bind(this), this.settings.esports.printToChannelTimeout);
    }

    private sendPrintout(channel: Discord.TextChannel, data: Map<string, ESportsLeagueSchedule[]> | undefined, date: string) {

        date = (date || momentjs().format("YYYY M D"))
            .split(" ")
            .join("/");
        if (!data || data.size === 0) {
            channel.send(`No games played on ${date}`);
            return;
        }
        const embed = new Discord.RichEmbed();
        embed.title = `Games being played ${date.split(" ").join("/")}:`;
        if (!embed.fields) embed.fields = [];
        embed.color = 0x9b311a;

        for (const [league, games] of data) {

            let output = "";
            for (const game of games) {

                const moment = momentjs(game.time, "YYYY MM DD HH:mm");
                if (moment.isBefore(new Date())) continue;

                output += `${game.teamA} vs ${game.teamB}, ${moment.fromNow()}\n`;
            }

            embed.fields.push({
                name: league,
                value: output + `[More about ${league} here](${this.getUrlByLeague(league)})\n`,
            });
        }

        channel.send({ embed });
    }

    // this can also check for older games by using resultsHtml instead of fixures
    private async loadData() {
        // pull data
        const data = await fetch("https://eu.lolesports.com/en/api/widget/schedule?timezone=Europe%2FOslo&leagues=26&leagues=3&leagues=2&leagues=6&leagues=7&leagues=5&leagues=4&leagues=9&leagues=10&leagues=1&leagues=43&slug=all");
        const html = (await data.json() as ESportsAPIReturnData).fixturesHtml;
        const schedule: Map<string, Map<string, ESportsLeagueSchedule[]>> = new Map();

        // for each date
        const asHtml = CheerioAPI.load(html);
        const parents = asHtml.root().find(".schedule__row-group");
        let currentYear = new Date().getFullYear();
        let currentMonth = new Date().getMonth() + 1;
        parents.each((_, dayGroup) => {
            // the current date
            const dayRoot = CheerioAPI.load(dayGroup).root();
            const date = dayRoot.find(".schedule__row--date").find("h2").text().split(" ");

            // get month number from text
            const gameMonth = new Date(`${date[1]} ${date[2]}`).getMonth() + 1;
            if (gameMonth < currentMonth) {
                currentMonth = gameMonth;
                currentYear++;
            }

            const realDate = `${currentYear} ${gameMonth} ${date[1]}`;
            schedule.set(realDate, new Map());

            // for each league
            const titles = dayRoot.find(".schedule__row--title");
            for (let index = 0; index < titles.length; index++) {
                const titleRow = titles.get(index);
                const tableRow = titleRow.next;

                // league title
                const titleRoot = CheerioAPI.load(titleRow).root();
                const title = titleRoot.find("h3 a").text();
                schedule.get(realDate)!.set(title, []);

                // league games
                const tableRoot = CheerioAPI.load(tableRow).root();
                const games = tableRoot.find(".schedule__table-row");

                // for each game
                for (let gameIndex = 0; gameIndex < games.length; gameIndex++) {
                    const gameRow = games.get(gameIndex);
                    const gameRoot = CheerioAPI.load(gameRow).root();

                    // game start time
                    const start = gameRoot.find(".schedule__table-cell--time .time").last().text().trim();
                    const timestamp = realDate + ` ${start}`;

                    // teams
                    const content = gameRoot.find(".schedule__table-cell--content .team a");
                    const teamA = content.first().text();
                    const teamB = content.last().text();

                    const gameData: ESportsLeagueSchedule = {
                        league: title,
                        time: timestamp,
                        teamA,
                        teamB,
                    };
                    schedule.get(realDate)!.get(title)!.push(gameData);
                }
            }
        });
        this.schedule = schedule;
        setTimeout(this.loadData.bind(this), this.settings.esports.updateTimeout);
    }

    private getUrlByLeague(leagueName: string) {

        // Hotfix for worlds
        if (leagueName === "World Championship") leagueName = "worlds";

        return "https://eu.lolesports.com/en/league/" + leagueName.replace(/ /g, "-").toLowerCase();
    }
}
