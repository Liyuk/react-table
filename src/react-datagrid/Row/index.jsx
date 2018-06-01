'use strict';

var React       = require('react')
var Region      = require('region')
var assign      = require('object-assign')
var normalize = require('react-style-normalizer')
var Cell        = require('../Cell')
var CellFactory = React.createFactory(Cell)
var ReactMenu = require('react-menus')
var ReactMenuFactory = React.createFactory(ReactMenu)
var renderRow  = require('../render/renderRow')

var Row = React.createClass({

  displayName: 'ReactDataGrid.Row',

  propTypes: {
    data   : React.PropTypes.any,
    parentDataInfo: React.PropTypes.array,
    columns: React.PropTypes.array,
    index  : React.PropTypes.number
  },

  getDefaultProps: function(){

    return {
      defaultStyle: {}
    }
  },

  getInitialState: function(){
    return {
      mouseOver: false
    }
  },

  render: function() {
    var props = this.prepareProps(this.props)
    var cells = props.children || props.columns
            .map(this.renderCell.bind(this, this.props))

    return <div {...props}>{cells}</div>
  },

  prepareProps: function(thisProps){
    var props = assign({}, thisProps)

    props.className = this.prepareClassName(props, this.state)
    props.style = this.prepareStyle(props)

    props.onMouseEnter = this.handleMouseEnter
    props.onMouseLeave = this.handleMouseLeave
    props.onContextMenu = this.handleContextMenu
    props.onClick = this.handleRowClick

    delete props.data
    delete props.cellPadding

    return props
  },

  handleRowClick: function(event){

    if (this.props.onClick){
        this.props.onClick(event)
    }

    if (this.props._onClick){
        this.props._onClick(this.props, event)
    }
  },

  handleContextMenu: function(event){

    if (this.props.rowContextMenu){
      this.showMenu(event)
    }

    if (this.props.onContextMenu){
      this.props.onContextMenu(event)
    }
  },

  showMenu: function(event){
    var factory = this.props.rowContextMenu
    var alignTo = Region.from(event)

    var props = {
        style: {
            position: 'absolute'
        },
        rowProps: this.props,
        data    : this.props.data,
        alignTo : alignTo,
        alignPositions: [
            'tl-bl',
            'tr-br',
            'bl-tl',
            'br-tr'
        ],
        items: [
            {
                label: 'stop'
            }
        ]
    }

    var menu = factory(props)

    if (menu === undefined){
        menu = ReactMenuFactory(props)
    }

    event.preventDefault()

    this.props.showMenu(function(){
        return menu
    })
  },

  handleMouseLeave: function(event){
    var props = this.props

    this.setState({
      mouseOver: false
    })

    if (props.onRowMouseLeave) {
      props.onRowMouseLeave(event, props.index)
    }

    if (props.onMouseLeave){
      props.onMouseLeave(event)
    }
  },

  handleMouseEnter: function(event){
    var props = this.props

    this.setState({
      mouseOver: true
    })

    if (props.onRowMouseEnter) {
      props.onRowMouseEnter(event, props.index)
    }
    if (props.onMouseEnter){
      props.onMouseEnter(event)
    }
  },

  renderCell: function(props, column, index){

    var text = props.data ? props.data[column.name] : props.data;
    var columns = props.columns

    var cellProps = {
      style      : column.style,
      className  : column.className,

      key        : column.name,
      name       : column.name,

      data       : props.data,
      columns    : columns,
      index      : index,
      rowIndex   : props.index,
      textPadding: props.cellPadding,
      renderCell : props.renderCell,
      renderText : props.renderText
    }

    if (typeof column.render == 'function'){
        /*
         * 第五个参数，把当前row元素传给对象
         */
        text = column.render(text, props.data, cellProps, props.parentDataInfo, this)
    } else if (column.columns) {
        cellProps.className = (cellProps.className || "") + ' z-sub-table';
        text = this.renderSubRow(props, text, column, props.parentDataInfo || [props.data]);
    }

    cellProps.text = text

    var result

    if (props.cellFactory){
      result = props.cellFactory(cellProps)
    }

    if (result === undefined){
      result = CellFactory(cellProps)
    }

    return result
  },

  renderSubRow(props, dataList, column, parentDataInfo){
      if (column.isGroup) {
          return <Row className="z-sub-row" data={dataList} columns={column.columns} parentDataInfo={[data].concat(parentDataInfo)}/>
      } else {
          if (!dataList)
              return null;

          var index = 0, rows = [];
          var data, ls = dataList.length;
          for (; index < ls; index++) {
              data = dataList[index]
              rows.push(<Row key={index} className="z-sub-row" data={data} columns={column.columns} parentDataInfo={[data].concat(parentDataInfo)}/>);
          }
          return rows;
      }
  },

  prepareClassName: function(props, state){
      var className = props.className || ''

      className += ' z-row '

      if (props.index % 2 === 0){
        className += ' z-even ' + (props.evenClassName || '')
      } else {
        className += ' z-odd ' + (props.oddClassName || '')
      }

      if (state.mouseOver || props.index === props.hoverRowIndex){
        className += ' z-over ' + (props.overClassName || '')
      }

      if (props.selected){
        className += ' z-selected ' + (props.selectedClassName || '')
      }

      return className
  },

  prepareStyle: function(props){

    var style = assign({}, props.defaultStyle, props.style)
    
    var rowHeight = typeof props.rowHeight === 'number' ? props.rowHeight : props.rowHeight(props.data);
    style.height   = rowHeight
    style.minWidth = props.minWidth

    return style
  }
})

module.exports = Row;
