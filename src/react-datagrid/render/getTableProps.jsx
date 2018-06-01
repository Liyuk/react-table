'use strict';

var React = require('react')
var renderMenu = require('./renderMenu')
var renderRow  = require('./renderRow')
var tableStyle  = require('./tableStyle')
var slice  = require('./slice')
var LoadMask = require('react-load-mask')


var Row         = require('../Row')
var Cell        = require('../Cell')

function getData(props){

    if (!props.virtualRendering){
        return props.data
    }

    return slice(props.data, props)
}

module.exports = function (props, rows, subGridIsOpenFun) {
    var allData = props.data;
    var dataList=getData(props);

    //region sub grid param
    var hasSubGrid = !!props.renderSubGrid;
    var sgCellStyle = {
        //minWidth: props.totalColumnWidth,
        width: '100%'
    }
    var sgRowStyle = {
        transform: 'translate3d(' + (props.fixed ? 0 : props.scrollLeft) + 'px, 0px, 0px)'
    }
    //endregion

    if(!rows){
        rows = [];

        let data, index = 0, lg = dataList.length;
        for (; index < lg; index++) {
            data = dataList[index];
            rows.push(renderRow.call(this, props, data, index + props.startIndex));
            //insert sub grid
            if (hasSubGrid && subGridIsOpenFun(data)){
                // var rowHeight = typeof props.rowHeight === 'number' ? props.rowHeight : props.rowHeight(data);
                var subGridHeight = typeof props.subGridHeight === 'number' ? props.subGridHeight : props.subGridHeight(data);
                rows.push(
                    <Row key={'subGird-'+data.id} className="z-sub-grid-row" style={sgRowStyle} rowHeight={subGridHeight}>
                        <Cell
                            contentPadding={props.cellPadding}
                            contentWidth="100%"
                            text={props.renderSubGrid(data, dataList, allData)}
                            style={sgCellStyle}
                        />
                    </Row>
                )
            }
        }

    }

    // if (props.topLoader && props.scrollTop < (2 * props.rowHeight)){
        // rows.unshift(props.topLoader)
    // }

    return {
        className: 'z-table',
        style: tableStyle(props),
        children: rows
    }
}
