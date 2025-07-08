declare const millisecondsSymbol: unique symbol;
declare const secondsSymbol: unique symbol;
declare const hoursSymbol: unique symbol;

export type Milliseconds = number & { [millisecondsSymbol]: never };
export type Seconds = number & { [secondsSymbol]: never };
export type Hours = number & { [hoursSymbol]: never };

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
