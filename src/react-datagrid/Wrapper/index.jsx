'use strict';

var React    = require('react')
var assign   = require('object-assign')
var Scroller = require('./scroll/react-virtual-scroller')
var ContentTable = require('./ContentTable')

function emptyFn(){}

module.exports = React.createClass({

    displayName: 'ReactDataGrid.Wrapper',

    propTypes: {
        scrollLeft   : React.PropTypes.number,
        scrollTop    : React.PropTypes.number,
        scrollbarSize: React.PropTypes.number,
        rowHeight   : React.PropTypes.any,
        renderCount : React.PropTypes.number
    },

    getDefaultProps: function(){
        return {
            scrollLeft: 0,
            scrollTop : 0
        }
    },

    onMount: function(scroller){
        ;(this.props.onMount || emptyFn)(this, scroller)
    },

    render: function() {

        var props     = this.prepareProps(this.props)
        var rowsCount = props.renderCount

        var groupsCount = 0
        if (props.groupData && props.groupData.groupsCount){
            groupsCount = props.groupData.groupsCount
        }

        rowsCount += groupsCount

        // var loadersSize = props.loadersSize
        var rowHeight = typeof props.rowHeight === 'number' ? props.rowHeight : props.rowHeight();
        var verticalScrollerSize = props.verticalScrollerSize || (props.totalLength + groupsCount) * rowHeight// + loadersSize

        var content;
        if (props.empty) {
            content = <div className="z-empty-text" style={props.emptyTextStyle}>{props.emptyText}</div>
        } else {
            content = (
                <div {...props.tableProps} ref="table">
                    <ContentTable
                        {...props.tableProps}
                        virtualRendering={props.virtualRendering}
                    />
                </div>
            )
        }

        return <Scroller
                ref="scroller"
                onMount={this.onMount}
                preventDefaultHorizontal={false}
                virtualRendering={props.virtualRendering}

                loadMask={!props.loadMaskOverHeader}
                loading={props.loading}

                scrollbarSize={props.scrollbarSize}

                minVerticalScrollStep={rowHeight}
                scrollTop={props.scrollTop}
                scrollLeft={props.scrollLeft}

                scrollHeight={verticalScrollerSize}
                scrollWidth={props.minRowWidth}

                onVerticalScroll={this.onVerticalScroll}
                onHorizontalScroll={this.onHorizontalScroll}
                onResize={this.onResize}
            >
            {content}
        </Scroller>
    },

    onVerticalScrollOverflow: function() {
    },

    onHorizontalScrollOverflow: function() {
    },

    onHorizontalScroll: function(scrollLeft, event) {
        this.props.onScrollLeft(scrollLeft, event)
    },

    onVerticalScroll: function(pos, event){
        this.props.onScrollTop(pos, event)
    },

    onResize: function (){
        this.props.onResize()
    },

    syncVerticalScrollbar(scrollTop, event) {
        this.refs.scroller.syncVerticalScrollbar(scrollTop, event)
    },

    prepareProps: function(thisProps){
        var props = {}

        assign(props, thisProps)

        return props
    }
})
