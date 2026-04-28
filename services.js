class APIError extends Error {
    constructor(message) {
        super(message);
        this.status = 502;
    }
}

async function enrichProfile(name) {
    const [genderRes, agifyRes, nationalizeRes] = await Promise.all([
        fetch(`https://api.genderize.io?name=${encodeURIComponent(name)}`),
        fetch(`https://api.agify.io?name=${encodeURIComponent(name)}`),
        fetch(`https://api.nationalize.io?name=${encodeURIComponent(name)}`)
    ]);

    if (!genderRes.ok) throw new APIError('Genderize returned an invalid response');
    if (!agifyRes.ok) throw new APIError('Agify returned an invalid response');
    if (!nationalizeRes.ok) throw new APIError('Nationalize returned an invalid response');

    const genderData = await genderRes.json();
    const agifyData = await agifyRes.json();
    const nationalizeData = await nationalizeRes.json();

    if (genderData.gender === null || genderData.count === 0) {
        throw new APIError('Genderize returned an invalid response');
    }
    if (agifyData.age === null) {
        throw new APIError('Agify returned an invalid response');
    }
    if (!nationalizeData.country || nationalizeData.country.length === 0) {
        throw new APIError('Nationalize returned an invalid response');
    }

    let age_group;
    if (agifyData.age <= 12) age_group = "child";
    else if (agifyData.age <= 19) age_group = "teenager";
    else if (agifyData.age <= 59) age_group = "adult";
    else age_group = "senior";

    let highestProbCountry = nationalizeData.country[0];
    for (const c of nationalizeData.country) {
        if (c.probability > highestProbCountry.probability) {
            highestProbCountry = c;
        }
    }

    return {
        gender: genderData.gender,
        gender_probability: genderData.probability,
        sample_size: genderData.count,
        age: agifyData.age,
        age_group,
        country_id: highestProbCountry.country_id,
        country_probability: highestProbCountry.probability
    };
}

const countryList = require('country-list');
const countries = countryList.getData();
const countryMap = {};
countries.forEach(c => {
    countryMap[c.name.toLowerCase()] = c.code;
});

function parseNaturalLanguageQuery(q) {
    if (!q || typeof q !== 'string') return null;
    
    const words = q.toLowerCase().split(/\s+/);
    let filters = {};
    let isInterpreted = false;
    
    if (words.includes('males') || words.includes('male') || words.includes('men')) {
        if (!words.includes('female') && !words.includes('females') && !words.includes('women')) {
            filters.gender = 'male';
            isInterpreted = true;
        } else {
            isInterpreted = true;
        }
    } else if (words.includes('females') || words.includes('female') || words.includes('women')) {
        filters.gender = 'female';
        isInterpreted = true;
    }
    
    if (words.includes('people')) isInterpreted = true;

    if (words.includes('young')) {
        filters.min_age = 16;
        filters.max_age = 24;
        isInterpreted = true;
    }
    
    if (words.includes('child') || words.includes('children')) {
        filters.age_group = 'child';
        isInterpreted = true;
    } else if (words.includes('teenager') || words.includes('teenagers') || words.includes('teens')) {
        filters.age_group = 'teenager';
        isInterpreted = true;
    } else if (words.includes('adult') || words.includes('adults')) {
        filters.age_group = 'adult';
        isInterpreted = true;
    } else if (words.includes('senior') || words.includes('seniors')) {
        filters.age_group = 'senior';
        isInterpreted = true;
    }

    for (let i = 0; i < words.length - 1; i++) {
        if (words[i] === 'above' || words[i] === 'over') {
            const num = parseInt(words[i+1], 10);
            if (!isNaN(num)) {
                filters.min_age = num;
                isInterpreted = true;
            }
        } else if (words[i] === 'below' || words[i] === 'under') {
            const num = parseInt(words[i+1], 10);
            if (!isNaN(num)) {
                filters.max_age = num;
                isInterpreted = true;
            }
        }
    }
    
    const fromIndex = words.indexOf('from');
    if (fromIndex !== -1) {
        const potentialCountry = words.slice(fromIndex + 1).join(' ').replace(/[^a-z\\s]/g, '').trim();
        if (countryMap[potentialCountry]) {
            filters.country_id = countryMap[potentialCountry];
            isInterpreted = true;
        } else {
             for (const [c_name, c_code] of Object.entries(countryMap)) {
                  if (words.join(' ').includes(c_name)) {
                       filters.country_id = c_code;
                       isInterpreted = true;
                       break;
                  }
             }
        }
    } else {
         for (const [c_name, c_code] of Object.entries(countryMap)) {
             if (words.join(' ').includes(c_name)) {
                 filters.country_id = c_code;
                 isInterpreted = true;
                 break;
             }
         }
    }
    
    if (!isInterpreted) {
        return null;
    }
    
    return filters;
}

module.exports = { enrichProfile, APIError, parseNaturalLanguageQuery };
