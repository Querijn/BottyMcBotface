import { fileBackedObject } from "../FileBackedObject";
import { setTimeout, clearTimeout } from "timers";

import Discord = require("discord.js");

interface TicTacToeScore {
    lowWins: number;
    highWins: number;
    draws: number;
}

enum TicTacToeBrain {
    RANDOM,
    MINIMAX, // should finish this sometime :shrug:
}

enum TicTacToeType {
    X = "X", O = "O",
}

namespace TicTacToeType {
    export function opposite(current: TicTacToeType): TicTacToeType | undefined {
        if (current === TicTacToeType.X) return TicTacToeType.O;
        if (current === TicTacToeType.O) return TicTacToeType.X;
        return undefined;
    }
}

interface TicTacToeGame {
    board: { [key: number]: TicTacToeType | undefined };
    turnPlayer: TicTacToeType;
    Xplayer: { name: string, id: string };
    Oplayer: { name: string, id: string };
    scoreKey: string;
    botBrain: TicTacToeBrain | undefined;
    channel: Discord.TextChannel;
    deleteTimeout: NodeJS.Timer;
    wantDraw: string[];
    wantRematch: string[];
    isActive: boolean;
}

export default class TicTacToe {

    private scores: { [key: string]: TicTacToeScore };
    private games: TicTacToeGame[] = [];

    constructor(client: Discord.Client, scorefile: string) {
        this.scores = fileBackedObject(scorefile);
        client.on("message", this.handleChat.bind(this));
        client.on("ready", () => {

            // delete all ttt channels on startup, because we lost all gamestate on restart
            const gameCategory = (client.channels.findAll("type", "category") as Discord.CategoryChannel[]).find(c => c.name === "games");
            (client.channels.findAll("type", "text") as Discord.TextChannel[])
                .filter(c => c.parent === gameCategory)
                .forEach(c => {
                    if (c.name.startsWith("ttt-")) {
                        c.delete();
                    }
                });
        });
    }

    public async onInvite(message: Discord.Message, isAdmin: boolean, command: string, args: string[]) {
        const opponent = message.mentions.users.first();
        if (!opponent) {
            message.reply("You need to specify an opponent to start a TTT game!");
            return;
        }

        if (opponent === message.author) {
            message.reply("You can't play against yourself!");
            return;
        }

        const opponentName = opponent.username.toLowerCase();
        const senderName = message.author.username.toLowerCase();

        const isAuthorHigherId = message.author.id.localeCompare(opponent.id) >= 0;
        const highP = isAuthorHigherId ? { name: senderName, id: message.author.id } : { name: opponentName, id: opponent.id };
        const lowP = isAuthorHigherId ? { name: opponentName, id: opponent.id } : { name: senderName, id: message.author.id };

        if (args.length >= 2) {
            if (args[1] === "score") {
                this.printScores(message.channel as Discord.TextChannel, highP, lowP);
                return;
            }

            message.channel.send("Invalid arguments for command, try \"score\"");
            return;
        }

        // limit users to starting one game themselfs
        const alreadyPlaying = this.games.some(g => [g.Oplayer.id, g.Xplayer.id].every(p => p === highP.id || p === lowP.id));
        if (alreadyPlaying) {
            message.reply("You need to finish the game you are playing first!");
            return;
        }

        // only allow the players to send messages
        const permissions = [
            { id: message.author, type: "member", allow: ["SEND_MESSAGES"] },
            { id: opponent, type: "member", allow: ["SEND_MESSAGES"] },
            { id: message.guild.roles.find(r => r.name === "@everyone").id, type: "role", deny: ["SEND_MESSAGES"] },
        ];

        // setup a separate channel for the game, so we dont spam a real channel..
        const channelName = ("TTT-" + highP.name + "-vs-" + lowP.name).toLowerCase();
        const gameChannel = await message.guild.createChannel(channelName, "text", permissions) as Discord.TextChannel;
        let gameCategory = message.guild.channels.filter(c => c.type === "category").find(c => c.name === "games");
        if (!gameCategory) {
            gameCategory = await message.guild.createChannel("games", "category");
        }
        gameChannel.setParent(gameCategory);

        this.initFreshGame(gameChannel, highP, lowP, opponent.bot);
    }

    private initFreshGame(gameChannel: Discord.TextChannel, highP: { name: string, id: string }, lowP: { name: string, id: string }, bot: boolean) {
        const game = {} as TicTacToeGame;
        this.games.push(game);

        const key = highP.id + "_" + lowP.id;
        const random = Math.floor(Math.random() * 2);
        const status = this.scores[key] || (this.scores[key] = { highWins: 0, lowWins: 0, draws: 0 });
        game.Xplayer = random ? highP : lowP;
        game.Oplayer = random ? lowP : highP;
        game.botBrain = bot ? TicTacToeBrain.RANDOM : undefined;
        game.turnPlayer = TicTacToeType.O;
        game.channel = gameChannel;
        game.wantRematch = [];
        game.wantDraw = [];
        game.scoreKey = key;
        game.isActive = true;
        game.board = {
            1: undefined, 2: undefined, 3: undefined,
            4: undefined, 5: undefined, 6: undefined,
            7: undefined, 8: undefined, 9: undefined,
        };

        // print the "welcome" message
        const gamesPlayed = status.highWins + status.lowWins + status.draws;
        gameChannel.send(`Game ${gamesPlayed + 1} of ${highP.name} vs ${lowP.name}\nThe gods have decided that ${game.Xplayer.name} goes first`);

        this.incrementGameState(game, undefined);
    }

    private printGameBoard(game: TicTacToeGame) {
        const bl = game.board[1] || "1";
        const bm = game.board[2] || "2";
        const br = game.board[3] || "3";

        const ml = game.board[4] || "4";
        const mm = game.board[5] || "5";
        const mr = game.board[6] || "6";

        const tl = game.board[7] || "7";
        const tm = game.board[8] || "8";
        const tr = game.board[9] || "9";

        game.channel.send(`\`\`\`${tl} | ${tm} | ${tr}\n---------\n${ml} | ${mm} | ${mr}\n---------\n${bl} | ${bm} | ${br}\`\`\``);
    }

    private handleChat(message: Discord.Message) {
        const game = this.games.find(g => g.channel.id === message.channel.id);
        if (!game) return;

        if (game.isActive) {
            if (message.cleanContent === "!draw") {
                this.handleDraw(game, message.author.id);
            }

            if (message.cleanContent === "!ff") {
                this.handleFF(game, message.author.id);
            }
        }

        if (message.cleanContent === "!rematch") {
            this.handleRematch(game, message.author.id);
        }

        // ignore messages from the other player
        if (game.turnPlayer === TicTacToeType.X) {
            if (message.author.id === game.Oplayer.id) {
                return;
            }
        }
        if (game.turnPlayer === TicTacToeType.O) {
            if (message.author.id === game.Xplayer.id) {
                return;
            }
        }

        const regex = /^\d$/;
        if (regex.test(message.cleanContent)) {
            const move = +message.cleanContent;
            if (this.isValidMove(game.board, move)) {
                this.incrementGameState(game, move);
            }
        }
    }

    private handleRematch(game: TicTacToeGame, sender: string) {
        [game.Xplayer.id, game.Oplayer.id].forEach(playerId => {
            if (game.wantRematch.includes(playerId)) {
                return;
            }

            if (sender !== playerId) {
                return;
            }

            game.channel.send("Game will rematch when both players have entered the command");
            game.wantRematch.push(playerId);
        });

        if (game.botBrain !== undefined || game.wantRematch.length === 2) {
            clearTimeout(game.deleteTimeout);
            this.games = this.games.filter(g => g !== game);
            this.initFreshGame(game.channel, game.Xplayer, game.Oplayer, game.botBrain !== undefined);
        }
    }

    private handleFF(game: TicTacToeGame, sender: string) {
        if (sender === game.Xplayer.id) {
            this.handleEndOfGame(game, game.Oplayer.id);
        }

        if (sender === game.Oplayer.id) {
            this.handleEndOfGame(game, game.Xplayer.id);
        }
    }

    private handleDraw(game: TicTacToeGame, sender: string) {
        [game.Xplayer.id, game.Oplayer.id].forEach(playerId => {
            if (game.wantDraw.includes(playerId)) {
                return;
            }

            if (sender !== playerId) {
                return;
            }

            game.channel.send("Game will draw when both players have entered the command");
            game.wantDraw.push(playerId);
        });

        if (game.botBrain !== undefined || game.wantDraw.length === 2) {
            this.handleEndOfGame(game, "-1");
        }
    }

    private isValidMove(board: { [key: number]: TicTacToeType | undefined }, move: number) {
        return board[move] === undefined && move > 0 && move < 10;
    }

    private incrementGameState(game: TicTacToeGame, move: number | undefined) {
        if (move) {
            game.board[move] = game.turnPlayer;
        }

        game.turnPlayer = TicTacToeType.opposite(game.turnPlayer)!;
        this.printGameBoard(game);

        const winner = this.getGameWinner(game);
        if (winner) {
            this.handleEndOfGame(game, winner);
            return;
        }

        this.doBottyMove(game);
    }

    private handleEndOfGame(game: TicTacToeGame, winner: string) {

        const oplayer = game.channel.members.find(m => m.id === game.Oplayer.id);
        const xplayer = game.channel.members.find(m => m.id === game.Xplayer.id);

        const high = game.Xplayer.id.localeCompare(game.Oplayer.id) >= 0;
        const highP = high ? { name: xplayer.user.username, id: xplayer.id } : { name: oplayer.user.username, id: oplayer.id };
        const lowP = high ? { name: oplayer.user.username, id: oplayer.id } : { name: xplayer.user.username, id: xplayer.id };

        if (winner === game.Oplayer.id) {
            if (high) {
                this.scores[game.scoreKey].highWins++;
            } else {
                this.scores[game.scoreKey].lowWins++;
            }
        } else if (winner === game.Xplayer.id) {
            if (high) {
                this.scores[game.scoreKey].lowWins++;
            } else {
                this.scores[game.scoreKey].highWins++;
            }
        } else if (winner === "-1") {
            this.scores[game.scoreKey].draws++;
        }

        game.isActive = false;
        game.channel.send("The game has ended!\nThis channel will be deleted in 30 seconds.");
        this.printScores(game.channel, highP, lowP);
        game.deleteTimeout = setTimeout(() => {
            this.games = this.games.filter(g => g !== game);
            game.channel.delete();
        }, 30 * 1000);
    }

    private printScores(channel: Discord.TextChannel, highP: { name: string, id: string }, lowP: { name: string, id: string }) {
        const key = highP.id + "_" + lowP.id;
        const highScore = this.scores[key].highWins;
        const lowScore = this.scores[key].lowWins;
        const drawScore = this.scores[key].draws;
        channel.send(`Scores are: ${highP.name} (${highScore}) - ${drawScore} - (${lowScore}) ${lowP.name}`);
    }

    /**
     * returns "-1" for a draw
     * returns undefined for unfinished
     * otherwise the playerid of the winner
     */
    private getGameWinner(game: TicTacToeGame) {

        if (this.testPlayerWin(game, TicTacToeType.X)) {
            return game.Xplayer.id;
        }

        if (this.testPlayerWin(game, TicTacToeType.O)) {
            return game.Oplayer.id;
        }

        for (let i = 1; i < 10; i++) {
            if (game.board[i] === undefined) {
                return undefined;
            }
        }

        return "-1";
    }

    private testPlayerWin(game: TicTacToeGame, player: TicTacToeType) {
        const isAllPlayer = (...args: number[]) => args.filter(x => game.board[x] === player).length === args.length;
        return isAllPlayer(1, 2, 3) || isAllPlayer(4, 5, 6)
            || isAllPlayer(7, 8, 9) || isAllPlayer(1, 4, 7)
            || isAllPlayer(2, 5, 8) || isAllPlayer(3, 6, 9)
            || isAllPlayer(1, 5, 9) || isAllPlayer(3, 5, 7);
    }

    private doBottyMove(game: TicTacToeGame) {
        const turnId = game.turnPlayer === TicTacToeType.X ? game.Xplayer : game.Oplayer;
        const isBottyTurn = game.channel.members.find(m => m.id === turnId.id).user.bot;

        if (isBottyTurn) {
            const bestMove = this.chooseMoveFromBrain(game.botBrain!, game.board, game.turnPlayer);
            this.incrementGameState(game, bestMove);
        }
    }

    private chooseMoveFromBrain(brain: TicTacToeBrain, board: { [key: number]: TicTacToeType | undefined }, turn: TicTacToeType): number {
        switch (brain) {
            case TicTacToeBrain.RANDOM: {
                const validKeys = Object.entries(board).filter(e => e[1] === undefined).map(e => e[0]);
                return +validKeys[Math.floor(Math.random() * validKeys.length)];
            }
            default: {
                return this.chooseMoveFromBrain(TicTacToeBrain.RANDOM, board, turn);
            }
        }
    }
}
