/**
 * Pure utility function to compute skill + interest overlap match score between two users
 */
const matchScore = (userA, userB) => {
    if (!userA || !userB) return 0;

    const skillsA = (userA.skills || []).map(s => (s.name || "").toLowerCase().trim());
    const skillsB = (userB.skills || []).map(s => (s.name || "").toLowerCase().trim());

    const interestsA = (userA.interests || []).map(i => i.toLowerCase().trim());
    const interestsB = (userB.interests || []).map(i => i.toLowerCase().trim());

    // Compute intersections
    const matchingSkills = skillsA.filter(skill => skillsB.includes(skill));
    const matchingInterests = interestsA.filter(interest => interestsB.includes(interest));

    // Calculate score: Skills carry more weight (e.g., 10 points) than interests (e.g., 5 points)
    let score = 0;
    
    // Add points for skill overlap, incorporating proficiency levels if present
    matchingSkills.forEach(skillName => {
        const profA = (userA.skills.find(s => s.name.toLowerCase() === skillName) || {}).proficiency || "beginner";
        const profB = (userB.skills.find(s => s.name.toLowerCase() === skillName) || {}).proficiency || "beginner";
        
        // Base overlap points
        score += 10;
        
        // Bonus points for proficiency alignment
        if (profA === profB) {
            score += 5; // matching skill level
        }
    });

    score += matchingInterests.length * 5;

    return score;
};

module.exports = matchScore;
