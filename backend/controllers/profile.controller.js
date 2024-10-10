import Profile from "../models/profile.model.js";
import mailjet from "node-mailjet";
import dotenv from "dotenv";
import Interest from "../models/interest.model.js";
import Match from "../models/match.model.js";

dotenv.config();

// Create user profile after email verification
export const createProfile = async (req, res) => {
  try {
    const { email } = req.user;
    const {
      firstName,
      lastName,
      dob,
      height,
      religion,
      gender,
      city,
      state,
      country,
      contact,
      maritalStatus,
      community,
      community_preference,
      photos,
      timeOfBirth,
      placeOfBirth,
    } = req.body;

    // Check if a profile already exists for the email
    const profileExists = await Profile.findOne({ email });
    if (profileExists) {
      return res
        .status(400)
        .json({ message: "Profile already exists for this email" });
    }

    // Create new profile object
    const profile = new Profile({
      email, // Use email to link profile
      firstName,
      lastName,
      dob,
      height,
      religion,
      gender,
      city,
      state,
      country,
      contact,
      maritalStatus,
      community,
      community_preference,
      photos,
      timeOfBirth,
      placeOfBirth,
    });

    // Save profile to the database
    await profile.save();

    res.status(201).json({ message: "Profile created successfully", profile });
  } catch (error) {
    console.log("Error in createProfile controller " + err.message);
    res.status(500).json({ error: "Failed to create profile" });
  }
};

export const viewProfiles = async (req, res) => {
  try {
    const { email } = req.user; // Extract user gender from the token
    // console.log("User Info:", email);

    const userprofiles = await Profile.find({ email });

    const { gender, community_preference, height, dob } = userprofiles[0];

    // console.log(userprofiles);
    const currentDate = new Date();
    const userAge = currentDate.getFullYear() - new Date(dob).getFullYear();

    let heightFilter = {};
    let ageFilter = {};

    // Apply height filter based on the user's gender
    if (gender === "male") {
      // For males, find females with height less than the user's height
      heightFilter = {
        $or: [
          {
            "height.feet": { $lt: height.feet }, // Less feet
          },
          {
            "height.feet": height.feet,
            "height.inches": { $lt: height.inches }, // Same feet but less inches
          },
        ],
      };

      ageFilter = {
        dob: {
          $gte: new Date(
            currentDate.setFullYear(currentDate.getFullYear() - userAge)
          ),
        }, // Younger
      };
    } else if (gender === "female") {
      // For females, find males with height greater than the user's height
      heightFilter = {
        $or: [
          {
            "height.feet": { $gt: height.feet }, // More feet
          },
          {
            "height.feet": height.feet,
            "height.inches": { $gt: height.inches }, // Same feet but more inches
          },
        ],
      };
      ageFilter = {
        dob: {
          $lte: new Date(
            currentDate.setFullYear(currentDate.getFullYear() - userAge)
          ),
        }, // Older
      };
    }

    const profiles = await Profile.find({
      gender: { $ne: gender },
      community_preference: community_preference,
      ...heightFilter,
      ...ageFilter,
    });

    res.status(200).json(profiles);
  } catch (error) {
    console.log("Error in viewProfiles controller " + err.message);
    res.status(500).json({ error: "Failed to view profiles" });
  }
};

const mailjetClient = mailjet.apiConnect(
  process.env.MAILJET_API_KEY,
  process.env.MAILJET_SECRET_KEY
);

export const showInterest = async (req, res) => {
  try {
    const { interestedUserId } = req.body;
    const { email } = req.user;
    const userShowingInterest = await Profile.findOne({ email });

    const interestedUserProfile = await Profile.findById(interestedUserId);

    if (!interestedUserProfile) {
      return res.status(404).json({ message: "Profile not found" });
    }

    const emailData = {
      Messages: [
        {
          From: {
            Email: process.env.COMPANY_EMAIL,
            Name: "MarryFest",
          },
          To: [
            {
              Email: interestedUserProfile.email,
              Name: interestedUserProfile.firstName,
            },
          ],
          Subject: `Interest by ${userShowingInterest.firstName} ${userShowingInterest.lastName}`,
          TextPart: `Hello ${interestedUserProfile.firstName},\n\n${userShowingInterest.firstName} has shown interest in your profile. Here are their details:\n\nName: ${userShowingInterest.firstName} ${userShowingInterest.lastName}\nDate of Birth: ${userShowingInterest.dob}\nHeight: ${userShowingInterest.height.feet} feet ${userShowingInterest.height.inches} inches\nReligion: ${userShowingInterest.religion}\nCity: ${userShowingInterest.city}, ${userShowingInterest.state}, ${userShowingInterest.country}\nContact: ${userShowingInterest.contact}\nCommunity: ${userShowingInterest.community}\n\nBest regards,\nYour Matrimony Team`,
        },
      ],
    };

    const request = await mailjetClient
      .post("send", { version: "v3.1" })
      .request(emailData);

    if (request.body.Messages[0].Status === "success") {
      const newInterest = new Interest({
        userShowingInterestId: userShowingInterest._id,
        interestedUserProfileId: interestedUserProfile._id,
      });
      await newInterest.save();
      res.status(200).json({ message: "Interest email sent successfully" });
    } else {
      res.status(500).json({ message: "Failed to send interest email" });
    }
  } catch (error) {
    console.error("Error in showInterest controller: ", error.message);
    res.status(500).json({ error: "Failed to show interest" });
  }
};

export const getReceivedInterests = async (req, res) => {
  try {
    const { email } = req.user; // Assume req.user contains the logged-in user's email
    const userProfile = await Profile.findOne({ email });

    const receivedInterests = await Interest.find({
      interestedUserProfileId: userProfile._id,
    }).populate("userShowingInterestId", "firstName lastName");

    // Include the interest ID for the "Accept" functionality
    const simplifiedInterests = receivedInterests.map((interest) => ({
      interestId: interest._id, // Add interest ID here
      firstName: interest.userShowingInterestId.firstName,
      lastName: interest.userShowingInterestId.lastName,
      dateOfInterest: interest.dateOfInterest,
    }));

    res.status(200).json(simplifiedInterests);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch received interests" });
  }
};

export const acceptInterest = async (req, res) => {
  try {
    const { interestId } = req.body;
    const { email } = req.user;
    console.log(email);

    const userProfile = await Profile.find({ email });

    const { _id } = userProfile[0];
    console.log(_id.toString());
    // return;

    // Find the interest record by its ID
    let interest = await Interest.find({
      userShowingInterestId: interestId,
      interestedUserProfileId: _id.toString(),
    });

    if (!interest) {
      return res.status(404).json({ message: "Interest not found" });
    }

    interest = interest[0];

    interest.mutual = true;
    await interest.save();

    // Create a new match entry in the Match model
    // const match = new Match({
    //   userA: interest.userShowingInterestId,
    //   userB: interest.interestedUserProfileId,
    // });

    // await match.save();

    res.status(200).json({ message: "Match created successfully" });
  } catch (error) {
    console.error("Error accepting interest: ", error.message);
    res.status(500).json({ message: "Failed to accept interest" });
  }
};

export const getMatches = async (req, res) => {
  try {
    const { email } = req.user;

    const userProfile = await Profile.find({ email });

    const { _id } = userProfile[0];
    console.log(_id);

    // Find all matches where the logged-in user is either userA or userB
    const matches = await Interest.find({
      $and: [
        { $or: [{ userShowingInterestId: _id.toString() }, {interestedUserProfileId : _id.toString()}] },
        { mutual: true },
      ],
    });

    const totalIds = [];

    matches.map((item)=>{
      totalIds.push(item.userShowingInterestId);
      totalIds.push(item.interestedUserProfileId);
    })

    
    const filterprofile = totalIds.filter((item)=>item!=_id.toString());
    
    console.log(_id);
    console.log(matches);


    const profiles = [];

    for(let it of filterprofile){
      const profile = await Profile.find({_id:it.toString()});
      profiles.push(profile[0]);
    }

    return res.status(200).send(profiles);

  } catch (error) {
    console.error("Error fetching matches: ", error.message);
    res.status(500).json({ message: "Failed to fetch matches" });
  }
};
