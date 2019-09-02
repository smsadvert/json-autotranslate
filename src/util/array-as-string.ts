const sepKey = ' <sep /> ';

export const arrayToString = obj => {
    if (!obj) return obj;
    Object.keys(obj).forEach(key => {
        if (Array.isArray(obj[key])) {
            obj[key] = obj[key].join(sepKey);
        }
    });
    console.log(obj);
    return obj;
}

export const stringToArray = obj => {
    if (!obj) return obj;
    Object.keys(obj).forEach(key => {
        const splitted = obj[key].split(sepKey);
        obj[key] = splitted.length === 1 ? splitted[0] : splitted;
    });
    console.log(obj);
    return obj;
}