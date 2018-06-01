'use strict';

var React = require('react')

var Row         = require('../Row')
var Cell        = require('../Cell')
var CellFactory = React.createFactory(Cell)

var renderRow = require('./renderRow')

function renderData(props, data, depth){

    return data.map((data, index)=>{
        return renderRow.call(this, props, data, index, function(config){
            config.cellFactory = function(cellProps){
                if (cellProps.index === 0){
                    cellProps.style.paddingLeft = depth * props.groupNestingWidth
                }

                return CellFactory(cellProps)
            }

            config.className += ' z-grouped'

            return config
        })
    })
}

function renderGroupRow(props, groupData){


    var cellStyle = {
        minWidth: props.totalColumnWidth,
        paddingLeft: (groupData.depth - 1) * props.groupNestingWidth
    }

    // for dynamic row height, this may make some mistake
    var rowHeight = typeof props.rowHeight === 'number' ? props.rowHeight : props.rowHeight();

    return <Row className='z-group-row' key={'group-'+groupData.valuePath} rowHeight={rowHeight}
                groupData={groupData}
                _onClick={this.handleGroupRowClick}>
        <Cell
            className='z-group-cell'
            contentPadding={props.cellPadding}
            text={groupData.value}
            style={cellStyle}
        />
    </Row>
}

function renderGroup(props, groupData){

    var result = [renderGroupRow.call(this, props, groupData)]

    if (groupData && groupData.leaf){
        result.push.apply(result, renderData.call(this, props, groupData.data, groupData.depth))
    } else {
        groupData.keys.forEach(key=>{
            var items = renderGroup.call(this, props, groupData.data[key])
            result.push.apply(result, items)
        })
    }

    return result
}

function renderGroups(props, groupsData){
    var result = []

    groupsData.keys.map(key=>{
        result.push.apply(result, renderGroup.call(this, props, groupsData.data[key]))
    })

    return result
}

module.exports = renderGroups
