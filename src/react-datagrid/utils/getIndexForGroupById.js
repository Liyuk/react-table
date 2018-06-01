'use strict';

function getRowIndexHelp(groupsData, idProperty, id) {
    var result = {success: true, index: -1}

    if (!groupsData) {
        result.success = false;
        return result

    } else if (groupsData.leaf) {
        let index = -1;

        let item, i = 0;
        while (item = groupsData.data[i++]) {
            index++;
            if (item[idProperty] === id) {
                result.index = index;
                return result
            }
        }

        result.success = false;
        result.index = index;
        return result

    } else {
        let sumIndex = -1;
        for (let i = 0, lg = groupsData.keys.length; i < lg; i++) {
            sumIndex++;//add group header row

            let key = groupsData.keys[i];
            let subGroupData = groupsData.data[key]
            let subResult = getRowIndexHelp(subGroupData, idProperty, id);

            sumIndex += subResult.index + 1;//add group index
            if (subResult.success) {//finded
                result.index = sumIndex;
                return result
            }
        }

        result.success = false;
        result.index = sumIndex;
        return result
    }
}

function getIndexForGroupById(groupsData, idProperty, id) {
    var result = getRowIndexHelp(groupsData, idProperty, id);
    return result.success ? result.index : -1;
}

module.exports = getIndexForGroupById
