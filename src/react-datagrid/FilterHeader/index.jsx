'use strict';

var React   = require('react')
var assign  = require('object-assign')
var clone   = require('clone')
var Cell    = require('../Cell')

var normalize   = require('react-style-normalizer')

module.exports = React.createClass({

    displayName: 'ReactDataGrid.FilterHeader',

    propTypes: {
        columns: React.PropTypes.array,
        columnFilterMap: React.PropTypes.object,
        onFilterInfoChange: React.PropTypes.func,
    },

    getDefaultProps: function(){
        return {
            defaultClassName : 'z-header-wrapper z-filter-header-wrapper',
            cellClassName    : 'z-column-header',
            defaultStyle    : {},
            scrollLeft      : 0,
            scrollTop       : 0
        }
    },

    render: function() {
        var props = this.prepareProps(this.props)

        var cellMap = {}
        var cells = props.columns
            .map(function(col, index){
                var cell = this.renderCell(props, col, index)
                cellMap[col.name] = cell

                return cell
            }, this)

        if (props.columnGroups && props.columnGroups.length){

            cells = props.columnGroups.map(function(colGroup){
                var cellProps = {}
                var columns = []

                var cells = colGroup.columns.map(function(colName){
                    var col = props.columnMap[colName]
                    columns.push(col)
                    return cellMap[colName]
                })

                return <Cell {...cellProps}>
                    {cells}
                </Cell>
            }, this)
        }

        var style = normalize(props.style)
        var headerStyle = normalize({
            paddingRight: props.scrollbarSize,
            transform   : 'translate3d(' + -props.scrollLeft + 'px, ' + -props.scrollTop + 'px, 0px)'
        })

        var title = props.showGroupName ?
            <div className="z-header z-sub-header-title">{props.title}</div> : '';
        return (
            <div style={style} className={props.className}>
                {title}
                <div className='z-header' style={headerStyle}>
                    {cells}
                </div>
            </div>
        )
    },

    renderCell: function(props, column, index){
        var className = props.cellClassName || ''

        className += ' z-unselectable'

        return (
            <Cell
                key={column.name}
                contentPadding={props.cellPadding}
                columns={props.columns || []}
                index={index}
                column={props.columns[index]}
                className={className}
                header={true}
                renderCell={this.renderCellContent.bind(this, column)}
            >
            </Cell>
        )
    },

    renderCellContent(column, contentProps, text, props){
        let oldTxt = this.props.columnFilterMap[column.name];
        let onFilterInfoChange = this.props.onFilterInfoChange;

        return (
            <div {...contentProps}>
                {(column.filterRender || this.renderCellContentDefault)(column, oldTxt, onFilterInfoChange)}
            </div>
        )
    },

    renderCellContentDefault(column, oldTxt, onFilterInfoChange){
        let disabled = !column.filterable;
        let searchable = column.searchable;
        let filterEvent = this.handleFilterChangeEvent.bind(this, column, onFilterInfoChange);
        return <input type={searchable ? 'search' : 'text'}
                      defaultValue={oldTxt}
                      disabled={disabled}
                      onKeyUp={filterEvent}
                      onBlur={filterEvent}/>;
    },

    handleFilterChangeEvent(column, onFilterInfoChange, e){
        window.clearTimeout(this.__timer);
        let sTxt = e.target.value;

        if (e.type == "blur" || e.keyCode == 13) {
            // 回车或失焦过滤
            onFilterInfoChange(column.name, sTxt);
        } else {
            // 0.5s 未输入过滤
            this.__timer = window.setTimeout(()=> {
                window.clearTimeout(this.__timer);
                onFilterInfoChange(column.name, sTxt);
            }, 500)
        }
    },

    prepareProps: function(thisProps){
        var props = {}

        assign(props, thisProps)

        this.prepareClassName(props)
        this.prepareStyle(props)

        var columnMap = {}

            ;(props.columns || []).forEach(function(col){
            columnMap[col.name] = col
        })

        props.columnMap = columnMap

        return props
    },

    prepareClassName: function(props){
        props.className = props.className || ''
        props.className += ' ' + props.defaultClassName
    },

    prepareStyle: function(props){
        var style = props.style = {}

        assign(style, props.defaultStyle)
    }
})
