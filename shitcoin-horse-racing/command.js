<template>
{{/* Author: @EddieOz */}}
{{/* Channel: kick.com/eddieoz */}}
{{/* Twitter: @eddieoz */}}

{{/* Horse Racing Game Betting Poll */}}

{{/* Messages */}}

{{define "betSyntaxError"}}
Invalid syntax. Use: !bet (blokitos) (Option: white, blue, green, brown)
{{end}}

{{define "notEnoughPoints"}}
You do not have enough blokitos!
{{end}}

{{define "betOpenMsg"}}
The betting poll is now open! Place your bets on: white, blue, green, or brown.
{{end}}

{{define "betCloseMsg"}}
The betting poll is now closed! No more bets are accepted.
{{end}}

{{define "betWinnerSetMsg"}}
The winning option is {{kicklet.GetTempGlobalVar "winningOption"}}. Distributing {{kicklet.GetTempGlobalVar "totalBetPoints"}} blokitos to winners...
{{end}}

{{define "betAcceptedMsg"}}
{{ sender }} your bet was accepted.
{{end}}

{{define "betAlreadyPlacedMsg"}}
You have already placed a bet. You can only place one bet per poll.
{{end}}

{{define "noPermissionMsg"}}
@{{ sender }} you have no permission to do this.
{{end}}

{{ define "helpMsg" }}
    usage: aposta !bet [qtde] [white|blue|green|brown], !bet odds
{{end}}

{{define "oddsMsg"}}
Current odds: 
White: {{kicklet.GetCounter "oddsWhite"}}
Blue: {{kicklet.GetCounter "oddsBlue"}}
Green: {{kicklet.GetCounter "oddsGreen"}}
Brown: {{kicklet.GetCounter "oddsBrown"}}
{{end}}

{{script.Call "main"}}
{{$result := script.Var "result"}}

{{else if eq $result "NOT_ENOUGH_POINTS"}}
    {{template "notEnoughPoints"}}
{{else if eq $result "SYNTAX_ERROR"}}
    {{template "betSyntaxError"}}
{{else if eq $result "BET_OPEN"}}
    {{template "betOpenMsg"}}
{{else if eq $result "BET_CLOSE"}}
    {{template "betCloseMsg"}}
{{else if eq $result "WINNER_SET"}}
    {{template "betWinnerSetMsg"}}
{{else if eq $result "BET_ACCEPTED"}}
    {{template "betAcceptedMsg"}}
{{else if eq $result "BET_ALREADY_PLACED"}}
    {{template "betAlreadyPlacedMsg"}}
{{else if eq $result "BETTING_CLOSED"}}
    {{template "betCloseMsg"}}
{{else if eq $result "SHOW_ODDS"}}
    {{template "oddsMsg"}}
{{else if eq $result "NO_PERMISSION"}}
    {{template "noPermissionMsg"}}
{{else if eq $result "HELP"}}
    {{template "helpMsg"}}
{{end}}
</template>

<script>
    const username = $event.getSender().username;
    const args = $event.getCommandArgs();
    const options = ['white', 'blue', 'green', 'brown'];

    let result;

    function isInt(value) {
        return !isNaN(value) && parseInt(Number(value)) == value && !isNaN(parseInt(value, 10));
    }

    function isAdmin() {
        return ($event.getSender().hasPermission('broadcaster') || $event.getSender().hasPermission('moderator'));
    }

    async function main() {
        let bettingOpen = Kicklet.getTempGlobalVar('bettingOpen');
        let bets = Kicklet.getTempGlobalVar('bets') || [];
        let totalBetPoints = Kicklet.getTempGlobalVar('totalBetPoints') || 0;

        console.log('Current Bets:', bets.length);

        if (args.length == 1 && args[0] === 'open') {
            if (isAdmin()) {
                Kicklet.setTempGlobalVar('bettingOpen', true, 600);
                Kicklet.setTempGlobalVar('winningOption', '', 600);
                Kicklet.setTempGlobalVar('totalBetPoints', 0, 600);
                Kicklet.setCounter('oddsWhite', 0);
                Kicklet.setCounter('oddsBlue', 0);
                Kicklet.setCounter('oddsGreen', 0);
                Kicklet.setCounter('oddsBrown', 0);
                Kicklet.setCounter('totalBetPoints', 0);
                result = 'BET_OPEN';
            } else {
                result = 'NO_PERMISSION';
            }
        } else if (args.length == 1 && args[0] === 'help') {
            result = 'HELP';
        } else if (args.length == 1 && args[0] === 'close') {
            if (isAdmin()) {
                Kicklet.setTempGlobalVar('bettingOpen', false, 600);
                result = 'BET_CLOSE';
            } else {
                result = 'NO_PERMISSION';
            }
        } else if (args.length == 2 && args[0] === 'set' && !bettingOpen) {
            if (isAdmin()) {
                const winningOption = args[1];
                if (options.includes(winningOption)) {
                    Kicklet.setTempGlobalVar('winningOption', winningOption, 600);
                    await distributePoints(winningOption, bets, totalBetPoints);
                    result = 'WINNER_SET';
                } else {
                    result = 'SYNTAX_ERROR';
                }
            } else {
                result = 'NO_PERMISSION';
            }
        } else if (args.length == 2 && isInt(args[0]) && options.includes(args[1])) {
            if (bettingOpen) {
                const existingBet = bets.find(bet => bet.username === username);
                if (existingBet) {
                    result = 'BET_ALREADY_PLACED';
                } else {
                    const points = parseInt(Number(args[0]));
                    const option = args[1];
                    const pointsResponse = await Kicklet.getPoints(username);
                    const userPoints = pointsResponse.data.points;

                    if (userPoints >= points) {
                        bets.push({ username, points, option });
                        totalBetPoints += points;

                        Kicklet.setTempGlobalVar('bets', bets, 600);
                        Kicklet.setTempGlobalVar('totalBetPoints', totalBetPoints, 600);
                        Kicklet.setCounter('totalBetPoints', totalBetPoints);
                        Kicklet.setPoints(username, userPoints - points);
                        await calculateOdds(bets, totalBetPoints);
                        
                        result = 'BET_ACCEPTED';
                    } else {
                        result = 'NOT_ENOUGH_POINTS';
                    }
                }
            } else {
                result = 'BETTING_CLOSED';
            }
        } else if (args.length == 1 && args[0] === 'odds') {
            result = 'SHOW_ODDS';
            await calculateOdds(bets, totalBetPoints);
        } else {
            result = 'SYNTAX_ERROR';
        }
    }

    async function distributePoints(winningOption, bets, totalBetPoints) {
        const winningBets = bets.filter(bet => bet.option === winningOption);
        const totalWinningPoints = winningBets.reduce((acc, bet) => acc + bet.points, 0);

        for (const bet of winningBets) {
            const pointsResponse = await Kicklet.getPoints(bet.username);
            const userPoints = pointsResponse.data.points;
            const winShare = (bet.points / totalWinningPoints) * totalBetPoints;
            const winPoints = Math.floor(winShare);
            
            await Kicklet.setPoints(bet.username, userPoints + winPoints);
        }
        await resetPoll();
    }

    async function calculateOdds(bets, totalBetPoints) {
        const pointsOnOption = (option) => bets.filter(bet => bet.option === option).reduce((acc, bet) => acc + bet.points, 0);

        const oddsWhite = (pointsOnOption('white') / totalBetPoints).toFixed(2);
        const oddsBlue = (pointsOnOption('blue') / totalBetPoints).toFixed(2);
        const oddsGreen = (pointsOnOption('green') / totalBetPoints).toFixed(2);
        const oddsBrown = (pointsOnOption('brown') / totalBetPoints).toFixed(2);

        Kicklet.setCounter('oddsWhite', oddsWhite*100);
        Kicklet.setCounter('oddsBlue', oddsBlue*100);
        Kicklet.setCounter('oddsGreen', oddsGreen*100);
        Kicklet.setCounter('oddsBrown', oddsBrown*100);

    }

    async function resetPoll() {
        Kicklet.deleteTempGlobalVar('bets');
        Kicklet.deleteTempGlobalVar('bettingOpen');
        Kicklet.deleteTempGlobalVar('totalBetPoints');
        Kicklet.setCounter('oddsWhite', 0);
        Kicklet.setCounter('oddsBlue', 0);
        Kicklet.setCounter('oddsGreen', 0);
        Kicklet.setCounter('oddsBrown', 0);
        Kicklet.setCounter('totalBetPoints', 0);
        totalBetPoints = 0;
    }
</script>
