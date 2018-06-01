'use strict';
var React = require('react');

var ContentTable = React.createClass({
    propTypes: {
        virtualRendering: React.PropTypes.bool
    },

    /**
     * 仅横向滚动列表，不进行内容刷新
     */
    shouldComponentUpdate: function shouldComponentUpdate(nextProps, nextState) {
        var style = this.props.style || {};
        var nextStyle = nextProps.style || {};

        return this.props.virtualRendering || style.transform === undefined || style.transform === nextStyle.transform;
    },
    render: function () {
        return (
            <div>{this.props.children}</div>
        )
    }
});
module.exports = ContentTable;