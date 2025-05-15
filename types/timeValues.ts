declare const millisecondsSymbol: unique symbol;
declare const secondsSymbol: unique symbol;
declare const hoursSymbol: unique symbol;

export type Milliseconds = number & { [millisecondsSymbol]: void };
export type Seconds = number & { [secondsSymbol]: void };
export type Hours = number & { [hoursSymbol]: void };

export type HoursOfDay =
    | 0
    | 1
    | 2
    | 3
    | 4
    | 5
    | 6
    | 7
    | 8
    | 9
    | 10
    | 11
    | 12
    | 13
    | 14
    | 15
    | 16
    | 17
    | 18
    | 19
    | 20
    | 21
    | 22
    | 23;
