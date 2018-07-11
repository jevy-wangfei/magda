import React from "react";
import PropTypes from "prop-types";
import emptyStarIcon from "../assets/emptyStar.svg";
import "./StarRating.css";
import starIcon from "../assets/star.svg";

function StarRating(props) {
    const stars = Array(5)
        .fill(emptyStarIcon)
        .fill(starIcon, 0, props.stars);
    return (
        <div className="star-rating-box">
            {stars.map((icon, i) => (
                <span
                    key={i}
                    className={
                        icon === starIcon ? "full-star-icon" : "empty-star-icon"
                    }
                >
                    <img key={i} src={icon} alt="star rating" />
                </span>
            ))}
        </div>
    );
}

StarRating.propTypes = {
    stars: PropTypes.number
};

StarRating.defaultProps = {
    stars: 0
};

export default StarRating;
