import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js"
import { User } from "../models/user.model.js"
import { uploadOnCloudinary } from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js";

const registerUser = asyncHandler(async (req, res) => {

    //1) get user details from frontend
    const {fullName, email, userName, password} = req.body

    //2) validation - not empty
    if([fullName, email, userName, password].some( (field) => field?.trim() === "" )){
        throw new ApiError(400, "All fields are required")
    }

    //3) check if user already exists
    const existedUser = await User.findOne( {
        $or: [{ userName }, { email }]
    } )
    if(existedUser){
        throw new ApiError(409, "User already exists on this email or userName"
    }

    //4)check  for avatar and check for cover image
    const avatarLocalPath = req.files?.avatar[0]?.path
    if(!avatarLocalPath){
        throw new ApiError(400, "Avatar file is required")
    }
    //const coverImageLocalPath = req.files?.coverImage[0]?.path
    let coverImageLocalPath;
    if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0){
        coverImageLocalPath = req.files.coverImage[0].path
    }


    //5) upload them to cloudinary
    const avatar = await uploadOnCloudinary(avatarLocalPath)
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)
    if(!avatar){
        throw new ApiError(400, "Avatar file is required")
    }

    //6) create user object - create entry in db
    const user = await User.create({
        fullName,
        email,
        userName: userName.toLowerCase(),
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        password
    })

    //7) remove password and refresh token field from response
    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )

    //8) check for user creation
    if(!createdUser){
        throw new ApiError(500, "User creation failed on server side")
    }

    //9) return the response
    return res.status(201).json(
        new ApiResponse(
            200,
            createdUser,
            "User is created successfully"
        )
    )
})

export {
    registerUser
}